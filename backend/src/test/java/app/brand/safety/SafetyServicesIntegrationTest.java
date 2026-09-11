package app.brand.safety;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.brand.common.ApiException;
import app.brand.common.TextNormalizer;
import app.brand.content.AllowedHints;
import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.content.MessageSenderDto;
import app.brand.content.SenderPresenter;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.UserSettings;
import app.brand.user.UserSettingsRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * [D6] blocks, [D10] muted words and [B4] the sender presenter — the three pieces
 * wave 2 builds the inbox and the wall on.
 */
class SafetyServicesIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private BlockService blocks;

    @Autowired
    private RecipientPolicy recipients;

    @Autowired
    private SenderPresenter presenter;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private UserSettingsRepository settings;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JdbcTemplate jdbc;

    /* ---------------------------------------------------------- blocks [D6] */

    @Test
    @DisplayName("blocking twice keeps the first row, with the identity that was allowed then")
    void blockIsIdempotentAndFreezesTheDisplay() {
        AppUser blocker = account();
        AppUser blocked = account();

        Block first = blocks.block(blocker.getId(), blocked.getId(),
                Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, blocked.getSection().getId()));
        // A later, more revealing message must not upgrade the frozen row: the
        // Blocked list is not a way to find out who an anonymous sender was.
        Block again = blocks.block(blocker.getId(), blocked.getId(),
                Anonymity.from(AnonymityLevel.NAMED, AllowedHints.NONE, blocked.getSection().getId()));

        assertThat(again.getId()).isEqualTo(first.getId());
        assertThat(again.getDisplay().level()).isEqualTo(AnonymityLevel.ANONYMOUS);
        assertThat(jdbc.queryForObject("select count(*) from block where blocker_id = ?",
                Integer.class, blocker.getId())).isEqualTo(1);

        assertThat(blocks.isBlocked(blocker.getId(), blocked.getId())).isTrue();
        // [D6] Block is one-way: it refuses writes to the blocker, it does not cut
        // the blocker off from the person they blocked.
        assertThat(blocks.isBlocked(blocked.getId(), blocker.getId())).isFalse();
        assertThat(blocks.blockedIdsOf(blocker.getId())).containsExactly(blocked.getId());
        assertThat(blocks.blockersOf(blocked.getId())).containsExactly(blocker.getId());
    }

    @Test
    @DisplayName("blocking yourself is a 422, not a constraint violation")
    void selfBlockIsRefused() {
        AppUser user = account();
        Anonymity display = Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, null);

        assertThatThrownBy(() -> blocks.block(user.getId(), user.getId(), display))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.status().value()).isEqualTo(422));
    }

    @Test
    @DisplayName("unblocking someone else's row is 404, and the row survives")
    void unblockIsOwnRowsOnly() {
        AppUser blocker = account();
        AppUser other = account();
        AppUser blocked = account();
        Block row = blocks.block(blocker.getId(), blocked.getId(),
                Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, null));

        assertThatThrownBy(() -> blocks.unblock(other.getId(), row.getId()))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.status().value()).isEqualTo(404));
        assertThatThrownBy(() -> blocks.unblock(blocker.getId(), UUID.randomUUID()))
                .isInstanceOf(ApiException.class);
        assertThat(blocks.isBlocked(blocker.getId(), blocked.getId())).isTrue();

        blocks.unblock(blocker.getId(), row.getId());
        assertThat(blocks.isBlocked(blocker.getId(), blocked.getId())).isFalse();
        assertThat(blocks.listFor(blocker.getId())).isEmpty();
    }

    /* --------------------------------------------------- muted words [D10] */

    @Test
    @DisplayName("a muted word matches Turkish-folded, as a substring, and never blocks delivery")
    void mutedWordsAreTurkishAwareSubstrings() {
        AppUser recipient = account();
        mute(recipient, "İzmir", "kAmPüs");

        assertThat(recipients.mutedMatch(recipient.getId(), "izmir")).isTrue();
        assertThat(recipients.mutedMatch(recipient.getId(), "bu akşam IZMIR'de miyiz")).isTrue();
        assertThat(recipients.mutedMatch(recipient.getId(), "kampusun arkasi")).isTrue();
        assertThat(recipients.mutedMatch(recipient.getId(), "KAMPÜSTE görüşürüz")).isTrue();
        assertThat(recipients.mutedMatch(recipient.getId(), "ankara")).isFalse();
        assertThat(recipients.mutedMatch(recipient.getId(), "")).isFalse();
        assertThat(recipients.mutedMatch(recipient.getId(), null)).isFalse();

        // An account with no muted words matches nothing, and a missing settings row
        // is the default rather than an error.
        AppUser quiet = account();
        assertThat(recipients.mutedMatch(quiet.getId(), "izmir")).isFalse();
        assertThat(recipients.mutedMatch(UUID.randomUUID(), "izmir")).isFalse();
    }

    @Test
    @DisplayName("writing policy and the inbox push flag read the account's own settings")
    void policyDefaultsAndReads() {
        AppUser user = account();
        settings.saveAndFlush(UserSettings.defaultsFor(user.getId()));

        assertThat(recipients.writingPolicy(user.getId())).isEqualTo(WritingPolicy.ANYONE);
        assertThat(recipients.notifyInbox(user.getId())).isTrue();
        // No row at all is still the default: a read must never fail.
        assertThat(recipients.writingPolicy(UUID.randomUUID())).isEqualTo(WritingPolicy.ANYONE);
        assertThat(recipients.notifyInbox(UUID.randomUUID())).isTrue();

        jdbc.update("update user_settings set writing_policy = 'named_only', notify_inbox = false "
                + "where user_id = ?", user.getId());
        assertThat(recipients.writingPolicy(user.getId())).isEqualTo(WritingPolicy.NAMED_ONLY);
        assertThat(recipients.notifyInbox(user.getId())).isFalse();
    }

    /* ------------------------------------------------- sender presenter [B4] */

    @Test
    @DisplayName("chips come from the section snapshot; name and letter from the live account")
    void presenterSplitsSnapshotFromLive() {
        Section snapshot = anySection();
        AppUser sender = account();
        sender.setName("Şeyma Kaya");
        users.saveAndFlush(sender);

        MessageSenderDto anonymous = presenter.present(
                Anonymity.from(AnonymityLevel.ANONYMOUS, new AllowedHints(true, true, true), snapshot.getId()),
                sender, snapshot);
        assertThat(anonymous.level()).isEqualTo(AnonymityLevel.ANONYMOUS);
        assertThat(anonymous.name()).isNull();
        assertThat(anonymous.hints()).isNull();

        MessageSenderDto named = presenter.present(
                Anonymity.from(AnonymityLevel.NAMED, AllowedHints.NONE, snapshot.getId()), sender, snapshot);
        assertThat(named.name()).isEqualTo("Şeyma Kaya");
        assertThat(named.hints()).isNull();
        assertThat(named.avatar()).isNull();

        MessageSenderDto hinted = presenter.present(
                Anonymity.from(AnonymityLevel.HINT, new AllowedHints(true, false, true), snapshot.getId()),
                sender, snapshot);
        assertThat(hinted.name()).isNull();
        assertThat(hinted.hints().section()).isEqualTo(snapshot.getName());
        assertThat(hinted.hints().country()).isNull();
        assertThat(hinted.hints().letter()).isEqualTo("Ş");
    }

    @Test
    @DisplayName("an unknown level is 422 on anonymityLevel, and hint with no hint is 422 on allowedHints")
    void anonymityValidation() {
        assertThatThrownBy(() -> Anonymity.from("shy", AllowedHints.NONE, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.status().value()).isEqualTo(422);
                    assertThat(ex.field()).isEqualTo("anonymityLevel");
                });
        assertThatThrownBy(() -> Anonymity.from("hint", AllowedHints.NONE, null))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.status().value()).isEqualTo(422);
                    assertThat(ex.field()).isEqualTo("allowedHints");
                });
        // The booleans are forced false off a hint level, so a stray allowedHints
        // cannot leak a chip the sender did not pick.
        Anonymity named = Anonymity.from("named", new AllowedHints(true, true, true), null);
        assertThat(named.hintSection()).isFalse();
        assertThat(named.hintCountry()).isFalse();
        assertThat(named.hintLetter()).isFalse();
    }

    /* ------------------------------------------------------------ helpers */

    /**
     * Written as the settings endpoint (step B-5) will write them: as entered, and
     * as the normalised form the matcher reads.
     */
    private void mute(AppUser user, String... words) {
        settings.saveAndFlush(UserSettings.defaultsFor(user.getId()));
        String entered = String.join(",", words);
        String normalized = java.util.Arrays.stream(words)
                .map(TextNormalizer::normalizeForSearch)
                .collect(java.util.stream.Collectors.joining(","));
        jdbc.update("""
                update user_settings
                   set muted_words = string_to_array(?, ','),
                       muted_words_normalized = string_to_array(?, ',')
                 where user_id = ?
                """, entered, normalized, user.getId());
    }

    private AppUser account() {
        AppUser user = AppUser.register(
                "safety-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName("Member");
        user.setSection(anySection());
        return users.saveAndFlush(user);
    }

    private Section anySection() {
        return sections.findAll().stream().min(Comparator.comparing(Section::getName)).orElseThrow();
    }
}
