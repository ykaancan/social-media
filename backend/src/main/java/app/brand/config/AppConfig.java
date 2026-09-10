package app.brand.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class AppConfig {

    /**
     * Every "now" in the application comes from this bean, never from
     * {@code Instant.now()}, so a test can freeze or advance time (token expiry,
     * the 30-day section cooldown, the 5-second rejection undo).
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    /** [B3] BCrypt strength 12. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
