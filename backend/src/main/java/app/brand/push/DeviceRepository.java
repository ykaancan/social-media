package app.brand.push;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

    Optional<Device> findByPushToken(String pushToken);

    List<Device> findByUserId(UUID userId);

    /**
     * The locale a push to this account is written in: whichever of their phones
     * was seen most recently. Someone who carries two phones in two languages gets
     * the one they last opened the app on, which is the best guess available.
     */
    Optional<Device> findFirstByUserIdOrderByLastSeenAtDescIdDesc(UUID userId);

    List<Device> findByUserIdIn(List<UUID> userIds);

    long deleteByUserIdAndPushToken(UUID userId, String pushToken);

    long deleteByPushToken(String pushToken);

    /**
     * Registration is one statement, so two phones (or one phone retrying) cannot
     * race the unique index into a 500. {@code on conflict} is also what makes a
     * token that moved to another account re-bind instead of failing.
     */
    @Modifying
    @Query(value = """
            insert into device (user_id, push_token, platform, locale, created_at, last_seen_at)
            values (:userId, :token, :platform, :locale, :now, :now)
            on conflict (push_token) do update
               set user_id = excluded.user_id,
                   platform = excluded.platform,
                   locale = excluded.locale,
                   last_seen_at = excluded.last_seen_at
            """, nativeQuery = true)
    void upsert(@Param("userId") UUID userId,
                @Param("token") String token,
                @Param("platform") String platform,
                @Param("locale") String locale,
                @Param("now") Instant now);
}
