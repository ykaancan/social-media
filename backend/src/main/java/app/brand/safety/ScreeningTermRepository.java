package app.brand.safety;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScreeningTermRepository extends JpaRepository<ScreeningTerm, UUID> {

    /** The admin page's list: newest first, so a term just added is at the top. */
    List<ScreeningTerm> findAllByOrderByCreatedAtDescIdDesc();

    /**
     * The duplicate rule is on the <em>normalised</em> term, not the typed one:
     * "İZMİR" and "izmir" are one term, and adding the second is a 409 rather than
     * a second row nobody can tell apart. The severity is part of the key because
     * the same word may legitimately exist as {@code hard} and never as both by
     * accident — the admin has to delete one to change its severity.
     */
    boolean existsByNormalizedAndSeverity(String normalized, String severity);
}
