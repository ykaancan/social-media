package app.brand.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The same application as {@link AbstractIntegrationTest}, but listening on a
 * real port.
 *
 * <p>MockMvc cannot open a WebSocket, so the realtime tests [B12] need a running
 * connector. They share the one Postgres container the rest of the suite uses —
 * the context is a second one (a different {@code webEnvironment} is a different
 * cache key), the database is not.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestEndpointsConfig.class)
public abstract class AbstractWebSocketIntegrationTest {

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        // Touching the field starts the container if this class runs first.
        registry.add("spring.datasource.url", AbstractIntegrationTest.POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", AbstractIntegrationTest.POSTGRES::getUsername);
        registry.add("spring.datasource.password", AbstractIntegrationTest.POSTGRES::getPassword);
    }

    @LocalServerPort
    protected int port;

    protected String websocketUrl() {
        return "ws://localhost:" + port + "/ws";
    }
}
