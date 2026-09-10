package app.brand;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * [BRAND] backend.
 *
 * <p>The package name {@code app.brand} is a placeholder like {@code [BRAND]} itself
 * (BACKEND_PLAN.md §5); it is renamed once the brand exists.
 */
// The only credential in this product is the bearer token [B3]. Without this
// exclusion Spring Security would invent an in-memory user and print a generated
// password at startup — a login that nothing here should ever accept.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
