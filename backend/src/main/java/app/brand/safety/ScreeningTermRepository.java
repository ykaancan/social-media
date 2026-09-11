package app.brand.safety;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScreeningTermRepository extends JpaRepository<ScreeningTerm, UUID> {
}
