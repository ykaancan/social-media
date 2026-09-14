package app.brand.security;

import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads {@code Authorization: Bearer <access token>} and, if it verifies, loads
 * the account it names.
 *
 * <p>There is no cookie auth and no session: the app sends the same bearer on
 * every request and on the STOMP {@code CONNECT} frame [B3]. A missing or bad
 * token is not an error here — the request continues unauthenticated and the
 * authorization rules decide whether that is a 401.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";

    private final JwtService jwtService;
    private final AppUserRepository users;

    public JwtAuthenticationFilter(JwtService jwtService, AppUserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            bearer(request)
                    .flatMap(jwtService::verify)
                    .ifPresent(token -> load(token.userId())
                            .ifPresent(user -> authenticate(user, token.sessionId(), request)));
        }
        filterChain.doFilter(request, response);
    }

    private Optional<AppUser> load(UUID id) {
        // A deleted account (KVKK real deletion) stops authenticating immediately,
        // even while its access token is still inside its 15 minutes.
        return users.findById(id);
    }

    private void authenticate(AppUser user, UUID sessionId, HttpServletRequest request) {
        AppPrincipal principal = AppPrincipal.of(user, sessionId);
        var authentication = new UsernamePasswordAuthenticationToken(
                principal, null, List.of(new SimpleGrantedAuthority(user.getRole().authority())));
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private static Optional<String> bearer(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) {
            return Optional.empty();
        }
        String token = header.substring(BEARER.length()).trim();
        return token.isEmpty() ? Optional.empty() : Optional.of(token);
    }
}
