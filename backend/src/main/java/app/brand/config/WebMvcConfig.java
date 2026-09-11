package app.brand.config;

import app.brand.security.CurrentUserArgumentResolver;
import java.util.List;
import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    /** The two languages the product has: English default, Turkish. */
    public static final Locale TURKISH = Locale.forLanguageTag("tr");

    private final BrandProperties properties;

    public WebMvcConfig(BrandProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new CurrentUserArgumentResolver());
    }

    /**
     * {@code messages_en.properties} and {@code messages_tr.properties}, the same
     * key set on both sides exactly like the app's own {@code en.json} /
     * {@code tr.json} (CLAUDE.md).
     *
     * <p>Declared here instead of through {@code spring.messages.*}: Boot only
     * auto-configures a {@code MessageSource} when a bare {@code messages.properties}
     * is on the classpath, and there is no language-less default file to write —
     * English is a language, not a fallback. {@code defaultLocale} makes it the one
     * an unexpected locale lands on.
     */
    @Bean
    public MessageSource messageSource() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        source.setDefaultLocale(Locale.ENGLISH);
        return source;
    }

    /**
     * The server renders one surface — the password-reset page — and sends one
     * mail, and both are i18n like everything the app shows. There is no session
     * and no cookie to hold a preference, so the language is whatever the browser
     * asks for, narrowed to {@code en} / {@code tr} so a lookup can never miss.
     */
    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setDefaultLocale(Locale.ENGLISH);
        resolver.setSupportedLocales(List.of(Locale.ENGLISH, TURKISH));
        return resolver;
    }

    /**
     * The native app sends no {@code Origin} header, so this is for the Expo web
     * dev server and the admin page only — the allowed list is configuration, never
     * a wildcard.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(properties.cors().allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
