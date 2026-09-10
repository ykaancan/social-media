package app.brand.config;

import app.brand.security.ApprovedMemberFilter;
import app.brand.security.JwtAuthenticationFilter;
import app.brand.security.SecurityErrorResponder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Stateless bearer auth. No sessions, no cookies, no CSRF token: the only
 * credential is the {@code Authorization} header the app sends [B3].
 *
 * <p>CSRF is off because there is nothing a browser would send automatically — the
 * server-rendered reset form is the one HTML form, and it is reached only with a
 * one-hour single-use token in the URL.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtAuthenticationFilter jwtFilter,
                                                   ApprovedMemberFilter approvedFilter,
                                                   CorsConfigurationSource corsConfigurationSource,
                                                   SecurityErrorResponder responder) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .anonymous(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Register, login, refresh, logout, forgot-password: a 401 here
                        // means "wrong credentials", never "session expired".
                        .requestMatchers("/auth/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // [B10] avatars are public files.
                        .requestMatchers(HttpMethod.GET, "/media/**").permitAll()
                        // The server-rendered password reset page and its form post.
                        .requestMatchers("/reset", "/reset/**").permitAll()
                        // [B12] the STOMP handshake authenticates in its own interceptor.
                        .requestMatchers("/ws", "/ws/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        // [B11] the admin page is a static file; /admin/api/* is not public.
                        .requestMatchers(HttpMethod.GET, "/admin", "/admin/", "/admin/index.html",
                                "/admin/*.css", "/admin/*.js").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(responder)
                        .accessDeniedHandler(responder))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(approvedFilter, JwtAuthenticationFilter.class);

        return http.build();
    }
}
