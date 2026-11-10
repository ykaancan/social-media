package app.brand.event;

import app.brand.common.ApiException;
import app.brand.common.TextNormalizer;
import app.brand.event.EventDtos.CreateEventRequestDto;
import app.brand.event.EventDtos.EventDetailDto;
import app.brand.event.EventDtos.EventJoinResultDto;
import app.brand.event.EventDtos.EventPersonDto;
import app.brand.event.EventDtos.EventSummaryDto;
import app.brand.common.Ids;
import app.brand.organisation.MembershipDtos.OrganisationRefDto;
import app.brand.organisation.MembershipReader;
import app.brand.organisation.MembershipSections;
import app.brand.organisation.MembershipStatus;
import app.brand.organisation.Organisation;
import app.brand.organisation.OrganisationMember;
import app.brand.organisation.OrganisationMemberInserts;
import app.brand.organisation.OrganisationMemberRepository;
import app.brand.organisation.OrganisationRepository;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.MeMapper;
import app.brand.user.SectionRefDto;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Events and membership — the rules in BACKEND_PLAN.md §3 "Events", which are the
 * mock's rules unchanged.
 *
 * <p>Three of them shape everything here: status is derived and never stored
 * [B5]/[D4]; the event's section is the <em>creator's</em> section in the event's
 * organisation, never a field the client picks [D11]/[D15]; and a board you are
 * not a member of answers 404, not 403, so a join code cannot be probed for.
 *
 * <p>[D13] Every event belongs to an organisation, named by the create request.
 * [D16] Who may create one there is that organisation's switch. [D17] Joining by
 * code goes through the person's membership in the event's organisation.
 */
@Service
public class EventService {

    private static final Set<String> SCOPES = Set.of("section", "national");
    private static final Set<String> BOARD_MODES = Set.of("approve_first", "post_immediately");
    private static final Set<String> COVERS =
            Set.of("magenta", "coral", "tangerine", "amber", "lime", "mint", "azure", "violet");
    private static final int NAME_MIN = 2;
    private static final int NAME_MAX = 40;

    /** A collision at 32^6 is vanishingly rare; a create that fails because of one is not acceptable. */
    private static final int JOIN_CODE_ATTEMPTS = 8;

    private final EventRepository events;
    private final EventMemberRepository members;
    private final AppUserRepository users;
    private final OrganisationRepository organisations;
    private final OrganisationMemberRepository memberships;
    private final OrganisationMemberInserts membershipInserts;
    private final SectionRepository sections;
    private final EventAccess access;
    private final JoinCodeGenerator joinCodes;
    private final MeMapper meMapper;
    private final MembershipSections membershipSections;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public EventService(EventRepository events,
                        EventMemberRepository members,
                        AppUserRepository users,
                        OrganisationRepository organisations,
                        OrganisationMemberRepository memberships,
                        OrganisationMemberInserts membershipInserts,
                        SectionRepository sections,
                        EventAccess access,
                        JoinCodeGenerator joinCodes,
                        MeMapper meMapper,
                        MembershipSections membershipSections,
                        Clock clock,
                        PlatformTransactionManager transactionManager) {
        this.events = events;
        this.members = members;
        this.users = users;
        this.organisations = organisations;
        this.memberships = memberships;
        this.membershipInserts = membershipInserts;
        this.sections = sections;
        this.access = access;
        this.joinCodes = joinCodes;
        this.meMapper = meMapper;
        this.membershipSections = membershipSections;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    /* ----------------------------------------------------------- GET /events */

    /** Joined events at every status, live first. Never discovery. */
    @Transactional(readOnly = true)
    public List<EventSummaryDto> listMine(UUID viewerId) {
        Instant now = Instant.now(clock);
        List<Event> joined = events.findJoined(viewerId, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        if (joined.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = joined.stream().map(Event::getId).toList();
        Map<UUID, Long> memberCounts = counts(members.countMembers(ids));
        Map<UUID, Long> postCounts = counts(events.countPublishedPosts(ids));
        Map<UUID, Organisation> owners = organisations
                .findAllById(joined.stream().map(Event::getOrganisationId).distinct().toList()).stream()
                .collect(Collectors.toMap(Organisation::getId, Function.identity()));

        return joined.stream()
                .map(event -> summary(event, owners.get(event.getOrganisationId()), now,
                        memberCounts.getOrDefault(event.getId(), 0L),
                        postCounts.getOrDefault(event.getId(), 0L)))
                .toList();
    }

    /* ---------------------------------------------------------- POST /events */

    /**
     * The creator joins their own board as its moderator.
     *
     * <ul>
     *   <li>[D13] {@code organisationId} is required (422 when missing).</li>
     *   <li>[D16] The caller needs an {@code approved} membership there that the
     *       organisation's switch allows ({@code event_creation = members}, or role
     *       {@code admin}) — {@link MembershipReader#canCreateEvents}, the same rule
     *       {@code Membership.canCreateEvents} shows. Otherwise
     *       {@code 403 event_creation_not_allowed}: also for no membership, a
     *       pending or rejected one, an unknown organisation and a malformed id —
     *       none is an organisation this person can create in, and the answer does
     *       not tell them apart. Checked before the other fields.</li>
     *   <li>[D15]/P9 With sections: {@code scope} is required ({@code section |
     *       national}) and the event's section is the creator's <em>membership</em>
     *       section; {@code scope} decides whether the DTO shows the section, not
     *       which section it is. Without sections: {@code scope} must be absent
     *       (422 when sent) and the event has no section and no scope.</li>
     * </ul>
     *
     * <p>The insert runs in its own transaction per attempt, because a unique-index
     * collision on the join code poisons the transaction it happens in — the retry
     * has to be a fresh one.
     */
    public EventDetailDto create(UUID creatorId, CreateEventRequestDto request) {
        if (request == null) {
            throw ApiException.validation("missing event", "name");
        }
        if (request.organisationId() == null || request.organisationId().isBlank()) {
            throw ApiException.validation("missing organisation", "organisationId");
        }
        CreationRight right = transactions.execute(status -> creationRight(creatorId, request.organisationId()));

        String name = request.name() == null ? "" : request.name().trim();
        if (name.length() < NAME_MIN || name.length() > NAME_MAX) {
            throw ApiException.validation("name must be 2-40 characters", "name");
        }
        Instant startsAt = instant(request.startsAt(), "startsAt");
        Instant endsAt = instant(request.endsAt(), "endsAt");
        if (!endsAt.isAfter(startsAt)) {
            throw ApiException.validation("endsAt must be after startsAt", "endsAt");
        }
        String scope;
        if (right.organisation().hasSections()) {
            scope = oneOf(request.scope(), SCOPES, "scope");
        } else if (request.scope() != null) {
            throw ApiException.validation("this organisation has no sections, so an event has no scope", "scope");
        } else {
            scope = null;
        }
        String boardMode = oneOf(request.boardMode(), BOARD_MODES, "boardMode");
        String cover = oneOf(request.cover(), COVERS, "cover");

        Instant now = Instant.now(clock);
        UUID eventId = null;
        DataIntegrityViolationException lastCollision = null;
        for (int attempt = 0; attempt < JOIN_CODE_ATTEMPTS && eventId == null; attempt++) {
            String code = joinCodes.next();
            if (events.existsByJoinCode(code)) {
                continue;
            }
            try {
                final String joinCode = code;
                eventId = transactions.execute(status ->
                        insert(creatorId, right, name, scope, startsAt, endsAt, cover, boardMode, joinCode, now));
            } catch (DataIntegrityViolationException collision) {
                lastCollision = collision;
            }
        }
        if (eventId == null) {
            throw lastCollision != null ? lastCollision : new IllegalStateException("no join code available");
        }
        // Programmatic, not a self-call: `create` is deliberately not transactional
        // (the retry loop needs one transaction per attempt), so an annotation on
        // `detail` would not apply to a call from inside this class.
        final UUID created = eventId;
        return transactions.execute(status -> detail(creatorId, created));
    }

    /** The organisation the event goes into, and the creator's section there (null without sections). */
    private record CreationRight(Organisation organisation, UUID sectionId) {
    }

    /** [D16] See {@link #create}: every refusal is the same 403. */
    private CreationRight creationRight(UUID creatorId, String rawOrganisationId) {
        UUID organisationId = Ids.orNull(rawOrganisationId.trim());
        Organisation organisation = organisationId == null
                ? null
                : organisations.findById(organisationId).orElse(null);
        OrganisationMember membership = organisation == null
                ? null
                : memberships.findByOrganisationIdAndUserId(organisationId, creatorId).orElse(null);
        if (membership == null || !MembershipReader.canCreateEvents(organisation, membership)) {
            throw ApiException.forbidden("event_creation_not_allowed",
                    "this account may not create events in this organisation");
        }
        if (organisation.hasSections() && membership.getSectionId() == null) {
            // [D15] Every membership of an organisation with sections carries one:
            // the join and admin routes never write one without.
            throw new IllegalStateException("membership without a section in an organisation with sections");
        }
        return new CreationRight(organisation, organisation.hasSections() ? membership.getSectionId() : null);
    }

    private UUID insert(UUID creatorId,
                        CreationRight right,
                        String name,
                        String scope,
                        Instant startsAt,
                        Instant endsAt,
                        String cover,
                        String boardMode,
                        String joinCode,
                        Instant now) {
        Section section = right.sectionId() == null ? null : sections.findById(right.sectionId()).orElseThrow();
        Event event = events.saveAndFlush(Event.create(name, scope, section, right.organisation().getId(),
                startsAt, endsAt, cover, boardMode, joinCode, creatorId, now));
        members.saveAndFlush(EventMember.join(event.getId(), creatorId, true, now));
        return event.getId();
    }

    /* ----------------------------------------------------- POST /events/join */

    /**
     * Joining is idempotent in effect but not in answer: the app tells the person
     * they are already in, by name, rather than silently re-opening the board.
     *
     * <p>An archived board can still be joined — it is read-only for everyone, and
     * refusing would hide an event someone was given the code for.
     *
     * <p>[D17] The checks, in order:
     * <ol>
     *   <li>unknown or empty code → {@code not_found};</li>
     *   <li>already in the event → {@code already_joined};</li>
     *   <li>the caller's membership in the event's organisation:
     *     {@code approved} → joined; {@code pending} → {@code membership_pending};
     *     {@code rejected} → {@code membership_rejected}; none, in an organisation
     *     with approval off and no sections → an {@code approved} membership (role
     *     member, no section) is created and the event joined in this request;
     *     none, otherwise → {@code membership_required}, and this call writes
     *     nothing.</li>
     * </ol>
     */
    @Transactional
    public EventJoinResultDto join(UUID viewerId, String rawCode) {
        String code = JoinCodeGenerator.normalize(rawCode);
        if (code.isEmpty()) {
            return EventJoinResultDto.notFound();
        }
        Event event = events.findByJoinCode(code).orElse(null);
        if (event == null) {
            return EventJoinResultDto.notFound();
        }
        if (members.existsByEventIdAndUserId(event.getId(), viewerId)) {
            return EventJoinResultDto.alreadyJoined(event.getName());
        }

        Organisation organisation = organisations.findById(event.getOrganisationId()).orElseThrow();
        Instant now = Instant.now(clock);
        OrganisationMember membership = memberships
                .findByOrganisationIdAndUserId(organisation.getId(), viewerId)
                .orElse(null);
        if (membership == null) {
            if (organisation.isApprovalRequired() || organisation.hasSections()) {
                return refusal("membership_required", organisation, event);
            }
            // Nothing to pick and nobody to wait for. A lost race with an
            // identical request reads that request's row instead of failing.
            membershipInserts.insertIfAbsent(organisation.getId(), viewerId, MembershipStatus.APPROVED,
                    null, null, now);
            membership = memberships.findForUpdate(organisation.getId(), viewerId).orElseThrow();
        }
        if (membership.getStatus() != MembershipStatus.APPROVED && !organisation.isApprovalRequired()) {
            // [D14] Approval was switched off after this person asked (or was turned
            // down): the organisation no longer gates entry and nobody is watching
            // the queue, so they are let in. The section already on the row stays.
            membership = memberships.findForUpdate(organisation.getId(), viewerId).orElseThrow();
            membership.setStatus(MembershipStatus.APPROVED);
            membership.setApprovedAt(now);
            membership.setPendingEventId(null);
            memberships.saveAndFlush(membership);
        }
        switch (membership.getStatus()) {
            case PENDING:
                return refusal("membership_pending", organisation, event);
            case REJECTED:
                return refusal("membership_rejected", organisation, event);
            case APPROVED:
            default:
                break;
        }
        // The insert is the last check: a second tap that got past the check above
        // loses here and is told "already joined", never a 500 on the primary key.
        // `do nothing` also means a moderator rejoining their own board keeps the
        // flag [see EventMemberRepository#joinIfAbsent].
        int joined = members.joinIfAbsent(event.getId(), viewerId, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        if (joined == 0) {
            return EventJoinResultDto.alreadyJoined(event.getName());
        }
        return EventJoinResultDto.joined(detail(viewerId, event.getId()));
    }

    private static EventJoinResultDto refusal(String reason, Organisation organisation, Event event) {
        return EventJoinResultDto.membership(reason, OrganisationRefDto.of(organisation),
                organisation.isApprovalRequired(), event.getName());
    }

    /* ----------------------------------------------------- GET /events/{id} */

    @Transactional(readOnly = true)
    public EventDetailDto detail(UUID viewerId, UUID eventId) {
        Event event = access.requireMember(eventId, viewerId);
        return detail(event, access.isModerator(event, viewerId), viewerId);
    }

    /**
     * The same detail, for a caller that has already established both — the board
     * read [B12] enters through {@code EventAccess.requireMember} and asks for the
     * moderator flag before it builds anything, and asking the database those two
     * questions a second time is two queries per board open.
     */
    @Transactional(readOnly = true)
    public EventDetailDto detail(Event event, boolean isModerator, UUID viewerId) {
        return detail(event, isModerator, viewerId, members.findByEventId(event.getId()));
    }

    /** And again, for a caller that already holds the membership rows (it needs the flags). */
    @Transactional(readOnly = true)
    public EventDetailDto detail(Event event, boolean isModerator, UUID viewerId,
                                 List<EventMember> memberRows) {
        Instant now = Instant.now(clock);
        List<EventPersonDto> people = roster(event, memberRows, viewerId);
        long postCount = counts(events.countPublishedPosts(List.of(event.getId())))
                .getOrDefault(event.getId(), 0L);

        // The membership count, not the roster's length: an account with no name
        // yet is still a member, and `GET /events` counts it. The two lists must
        // agree with each other.
        Organisation organisation = organisations.findById(event.getOrganisationId()).orElseThrow();
        EventSummaryDto summary = summary(event, organisation, now, memberRows.size(), postCount);
        return new EventDetailDto(
                summary.id(), summary.name(), summary.organisation(), summary.scope(), summary.startsAt(), summary.endsAt(),
                summary.cover(), summary.boardMode(), summary.status(), summary.section(),
                summary.country(), summary.closedAt(), summary.memberCount(), summary.postCount(),
                event.getJoinCode(), isModerator, people);
    }

    /* -------------------------------------------------------------- mapping */

    private EventSummaryDto summary(Event event, Organisation organisation, Instant now,
                                    long memberCount, long postCount) {
        SectionRefDto section = meMapper.toSectionRef(event.getSection());
        return new EventSummaryDto(
                event.getId().toString(),
                event.getName(),
                OrganisationRefDto.of(organisation),
                // Null, and so absent, in an organisation without sections (P9).
                event.getScope(),
                event.getStartsAt(),
                event.getEndsAt(),
                event.getCover(),
                event.getBoardMode(),
                EventStatus.of(event, now),
                // [D11] The section rides along only for a section-scoped event; the
                // country is read off it whenever the event has one, and is never a
                // field of its own. No section, no country.
                "section".equals(event.getScope()) ? section : null,
                section == null ? null : section.country(),
                event.getClosedAt(),
                memberCount,
                postCount);
    }

    /**
     * The whole guest list, viewer first, then everyone else by normalised name —
     * "Boğaziçi" and "Bogazici" have to sort together, which the database collation
     * does not do.
     *
     * <p>[D15] Each person's {@code section} is their membership section in this
     * event's organisation — absent where the organisation has no sections — so a
     * person with sections in two organisations shows the right one in each event.
     */
    private List<EventPersonDto> roster(Event event, List<EventMember> memberRows, UUID viewerId) {
        List<UUID> memberIds = memberRows.stream()
                .map(EventMember::getUserId)
                .toList();
        List<AppUser> people = users.findAllById(memberIds).stream()
                .filter(user -> user.getName() != null && !user.getName().isBlank())
                .sorted(Comparator
                        .<AppUser, Integer>comparing(user -> user.getId().equals(viewerId) ? 0 : 1)
                        .thenComparing(user -> TextNormalizer.normalizeForSearch(user.getName()))
                        .thenComparing(user -> user.getId().toString()))
                .toList();

        Map<UUID, Section> sectionsHere = membershipSections.sectionsIn(event.getOrganisationId(),
                people.stream().map(AppUser::getId).toList());
        List<EventPersonDto> roster = new ArrayList<>(people.size());
        for (AppUser person : people) {
            roster.add(new EventPersonDto(
                    person.getId().toString(),
                    person.getName(),
                    meMapper.avatarUrl(person.getAvatarKey()),
                    meMapper.toSectionRef(sectionsHere.get(person.getId())),
                    person.getBio()));
        }
        return roster;
    }

    /* ------------------------------------------------------------- helpers */

    private static Map<UUID, Long> counts(List<Object[]> rows) {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    /** ISO-8601, with or without an offset. Anything else names the field it came from. */
    private static Instant instant(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.validation("missing timestamp", field);
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException notInstant) {
            try {
                return OffsetDateTime.parse(raw).toInstant();
            } catch (DateTimeParseException ex) {
                throw ApiException.validation("invalid timestamp", field);
            }
        }
    }

    private static String oneOf(String raw, Set<String> allowed, String field) {
        String value = raw == null ? null : raw.trim().toLowerCase(Locale.ROOT);
        if (value == null || !allowed.contains(value)) {
            throw ApiException.validation("invalid " + field, field);
        }
        return value;
    }
}
