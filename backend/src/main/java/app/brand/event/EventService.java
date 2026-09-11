package app.brand.event;

import app.brand.common.ApiException;
import app.brand.common.TextNormalizer;
import app.brand.event.EventDtos.CreateEventRequestDto;
import app.brand.event.EventDtos.EventDetailDto;
import app.brand.event.EventDtos.EventJoinResultDto;
import app.brand.event.EventDtos.EventPersonDto;
import app.brand.event.EventDtos.EventSummaryDto;
import app.brand.section.Section;
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
 * [B5]/[D4]; the event's section is the <em>creator's</em> section, never a field
 * the client picks [D11]; and a board you are not a member of answers 404, not
 * 403, so a join code cannot be probed for.
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
    private final EventAccess access;
    private final JoinCodeGenerator joinCodes;
    private final MeMapper meMapper;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public EventService(EventRepository events,
                        EventMemberRepository members,
                        AppUserRepository users,
                        EventAccess access,
                        JoinCodeGenerator joinCodes,
                        MeMapper meMapper,
                        Clock clock,
                        PlatformTransactionManager transactionManager) {
        this.events = events;
        this.members = members;
        this.users = users;
        this.access = access;
        this.joinCodes = joinCodes;
        this.meMapper = meMapper;
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

        return joined.stream()
                .map(event -> summary(event, now,
                        memberCounts.getOrDefault(event.getId(), 0L),
                        postCounts.getOrDefault(event.getId(), 0L)))
                .toList();
    }

    /* ---------------------------------------------------------- POST /events */

    /**
     * The creator joins their own board as its moderator, and the section comes off
     * their account: {@code scope} decides whether the DTO shows the section, not
     * which section it is.
     *
     * <p>The insert runs in its own transaction per attempt, because a unique-index
     * collision on the join code poisons the transaction it happens in — the retry
     * has to be a fresh one.
     */
    public EventDetailDto create(UUID creatorId, CreateEventRequestDto request) {
        AppUser creator = users.findById(creatorId)
                .orElseThrow(() -> ApiException.notFound("no such account"));
        if (creator.getSection() == null) {
            // Unreachable for an approved account: PUT /me/profile requires a section.
            throw ApiException.validation("account has no section", "scope");
        }

        if (request == null) {
            throw ApiException.validation("missing event", "name");
        }
        String name = request.name() == null ? "" : request.name().trim();
        if (name.length() < NAME_MIN || name.length() > NAME_MAX) {
            throw ApiException.validation("name must be 2-40 characters", "name");
        }
        Instant startsAt = instant(request.startsAt(), "startsAt");
        Instant endsAt = instant(request.endsAt(), "endsAt");
        if (!endsAt.isAfter(startsAt)) {
            throw ApiException.validation("endsAt must be after startsAt", "endsAt");
        }
        String scope = oneOf(request.scope(), SCOPES, "scope");
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
                        insert(creator, name, scope, startsAt, endsAt, cover, boardMode, joinCode, now));
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

    private UUID insert(AppUser creator,
                        String name,
                        String scope,
                        Instant startsAt,
                        Instant endsAt,
                        String cover,
                        String boardMode,
                        String joinCode,
                        Instant now) {
        Event event = events.saveAndFlush(Event.create(name, scope, creator.getSection(),
                startsAt, endsAt, cover, boardMode, joinCode, creator.getId(), now));
        members.saveAndFlush(EventMember.join(event.getId(), creator.getId(), true, now));
        return event.getId();
    }

    /* ----------------------------------------------------- POST /events/join */

    /**
     * Joining is idempotent in effect but not in answer: the app tells the person
     * they are already in, by name, rather than silently re-opening the board.
     *
     * <p>An archived board can still be joined — it is read-only for everyone, and
     * refusing would hide an event someone was given the code for.
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
        members.saveAndFlush(EventMember.join(event.getId(), viewerId, false, Instant.now(clock)));
        return EventJoinResultDto.joined(detail(viewerId, event.getId()));
    }

    /* ----------------------------------------------------- GET /events/{id} */

    @Transactional(readOnly = true)
    public EventDetailDto detail(UUID viewerId, UUID eventId) {
        Event event = access.requireMember(eventId, viewerId);
        Instant now = Instant.now(clock);

        List<EventPersonDto> people = roster(event, viewerId);
        long postCount = counts(events.countPublishedPosts(List.of(event.getId())))
                .getOrDefault(event.getId(), 0L);

        EventSummaryDto summary = summary(event, now, people.size(), postCount);
        return new EventDetailDto(
                summary.id(), summary.name(), summary.scope(), summary.startsAt(), summary.endsAt(),
                summary.cover(), summary.boardMode(), summary.status(), summary.section(),
                summary.country(), summary.closedAt(), summary.memberCount(), summary.postCount(),
                event.getJoinCode(), access.isModerator(event, viewerId), people);
    }

    /* -------------------------------------------------------------- mapping */

    private EventSummaryDto summary(Event event, Instant now, long memberCount, long postCount) {
        SectionRefDto section = meMapper.toSectionRef(event.getSection());
        return new EventSummaryDto(
                event.getId().toString(),
                event.getName(),
                event.getScope(),
                event.getStartsAt(),
                event.getEndsAt(),
                event.getCover(),
                event.getBoardMode(),
                EventStatus.of(event, now),
                // [D11] The section rides along only for a section-scoped event; the
                // country is read off it either way and is never a field of its own.
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
     */
    private List<EventPersonDto> roster(Event event, UUID viewerId) {
        List<UUID> memberIds = members.findByEventId(event.getId()).stream()
                .map(EventMember::getUserId)
                .toList();
        List<AppUser> people = users.findAllById(memberIds).stream()
                .filter(user -> user.getName() != null && !user.getName().isBlank())
                .sorted(Comparator
                        .<AppUser, Integer>comparing(user -> user.getId().equals(viewerId) ? 0 : 1)
                        .thenComparing(user -> TextNormalizer.normalizeForSearch(user.getName()))
                        .thenComparing(user -> user.getId().toString()))
                .toList();

        List<EventPersonDto> roster = new ArrayList<>(people.size());
        for (AppUser person : people) {
            roster.add(new EventPersonDto(
                    person.getId().toString(),
                    person.getName(),
                    meMapper.avatarUrl(person.getAvatarKey()),
                    meMapper.toSectionRef(person.getSection()),
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
