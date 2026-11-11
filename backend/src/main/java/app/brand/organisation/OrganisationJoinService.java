package app.brand.organisation;

import app.brand.common.ApiException;
import app.brand.event.Event;
import app.brand.event.EventMemberRepository;
import app.brand.event.EventRepository;
import app.brand.event.JoinCodeGenerator;
import app.brand.organisation.MembershipDtos.MembershipDto;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * [D17] {@code POST /organisations/join {code, sectionId?}}: a person enters an
 * organisation through an event join code that belongs to it. There is no
 * organisation search (TENANT_PLAN.md §3 rule 2).
 *
 * <ul>
 *   <li>Unknown code → {@code 404}.</li>
 *   <li>[D15] {@code sectionId} is required, and a section of that organisation,
 *       iff the organisation has sections; absent otherwise ({@link SectionChoice},
 *       {@code 422} on {@code sectionId}). It is not read for an already approved
 *       membership, whose section this route never changes.</li>
 *   <li>No membership yet, approval off → {@code approved} ({@code approved_at} now,
 *       {@code approved_by} null) and the event is joined now.</li>
 *   <li>No membership yet, approval on → {@code pending} with
 *       {@code pending_event_id} = the code's event; the event is not joined.</li>
 *   <li>{@code rejected} → back to {@code pending}, section replaced,
 *       {@code pending_event_id} = this event, {@code submitted_at} = now (P8).</li>
 *   <li>{@code pending} → stays pending; section and {@code pending_event_id}
 *       replaced by this request's.</li>
 *   <li>{@code approved} → the membership is unchanged and the event is joined
 *       idempotently.</li>
 * </ul>
 *
 * <p>Two identical requests at once: the create is an insert that cannot fail on
 * the primary key, and everything after it works on the row locked
 * {@code for update}, so the second request waits for the first and then sees
 * its row.
 */
@Service
public class OrganisationJoinService {

    private final EventRepository events;
    private final EventMemberRepository eventMembers;
    private final OrganisationRepository organisations;
    private final OrganisationMemberRepository members;
    private final OrganisationMemberInserts inserts;
    private final SectionChoice sectionChoice;
    private final MembershipReader reader;
    private final Clock clock;

    public OrganisationJoinService(EventRepository events,
                                   EventMemberRepository eventMembers,
                                   OrganisationRepository organisations,
                                   OrganisationMemberRepository members,
                                   OrganisationMemberInserts inserts,
                                   SectionChoice sectionChoice,
                                   MembershipReader reader,
                                   Clock clock) {
        this.events = events;
        this.eventMembers = eventMembers;
        this.organisations = organisations;
        this.members = members;
        this.inserts = inserts;
        this.sectionChoice = sectionChoice;
        this.reader = reader;
        this.clock = clock;
    }

    @Transactional
    public MembershipDto join(UUID userId, String rawCode, String rawSectionId) {
        String code = JoinCodeGenerator.normalize(rawCode);
        Event event = (code.isEmpty() ? null : events.findByJoinCode(code).orElse(null));
        if (event == null) {
            throw ApiException.notFound("no such event");
        }
        Organisation organisation = organisations.findById(event.getOrganisationId()).orElseThrow();
        Instant now = clock.instant();

        OrganisationMember existing = members.findForUpdate(organisation.getId(), userId).orElse(null);
        if (existing == null) {
            UUID sectionId = sectionChoice.sectionFor(organisation, rawSectionId);
            MembershipStatus status = organisation.isApprovalRequired()
                    ? MembershipStatus.PENDING
                    : MembershipStatus.APPROVED;
            int created = inserts.insertIfAbsent(organisation.getId(), userId, status, sectionId,
                    status == MembershipStatus.PENDING ? event.getId() : null, now);
            existing = members.findForUpdate(organisation.getId(), userId).orElseThrow();
            if (created == 1) {
                if (status == MembershipStatus.APPROVED) {
                    joinEvent(event, userId, now);
                }
                return reader.of(userId, organisation.getId());
            }
            // Lost the race to an identical request: carry on with the row it wrote.
        }

        if (existing.getStatus() != MembershipStatus.APPROVED && !organisation.isApprovalRequired()) {
            // [D14] Approval was switched off after this person asked (or was turned
            // down): the organisation no longer gates entry and nobody is watching
            // the queue, so asking again lets them in, with the section sent now.
            existing.setStatus(MembershipStatus.APPROVED);
            existing.setSectionId(sectionChoice.sectionFor(organisation, rawSectionId));
            existing.setApprovedAt(now);
            existing.setPendingEventId(null);
            members.saveAndFlush(existing);
        }
        switch (existing.getStatus()) {
            case APPROVED -> joinEvent(event, userId, now);
            case PENDING -> {
                existing.setSectionId(sectionChoice.sectionFor(organisation, rawSectionId));
                existing.setPendingEventId(event.getId());
                members.saveAndFlush(existing);
            }
            case REJECTED -> {
                existing.setStatus(MembershipStatus.PENDING);
                existing.setSectionId(sectionChoice.sectionFor(organisation, rawSectionId));
                existing.setPendingEventId(event.getId());
                existing.setSubmittedAt(now);
                members.saveAndFlush(existing);
            }
        }
        return reader.of(userId, organisation.getId());
    }

    /** The same idempotent insert {@code POST /events/join} uses. */
    private void joinEvent(Event event, UUID userId, Instant now) {
        eventMembers.joinIfAbsent(event.getId(), userId, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
    }
}
