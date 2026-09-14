package app.brand.section;

import app.brand.user.AccountStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SectionRepository extends JpaRepository<Section, UUID> {

    /**
     * Approved members per section, in one pass, for {@code GET /sections}.
     *
     * <p>Sections nobody has joined are simply absent from the result and read as
     * 0 — a real count, not a placeholder.
     */
    @Query("""
            select new app.brand.section.SectionMemberCount(u.section.id, count(u))
            from AppUser u
            where u.status = :status and u.section is not null
            group by u.section.id
            """)
    List<SectionMemberCount> countMembersByStatus(@Param("status") AccountStatus status);
}
