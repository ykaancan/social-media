package app.brand.user;

/**
 * {@code Person} in {@code types.ts}, plus the optional {@code wallEventId} the
 * roster rows carry.
 *
 * <p>Deliberately minimal: no email, no status, no role, and no {@code country} —
 * that is read off {@code section} [D11]. Nothing here is an identity the viewer
 * was not already allowed to see.
 *
 * <p>{@code avatarUrl} and {@code wallEventId} are dropped from the JSON when null
 * ({@code non_null} inclusion), so the client sees them absent, as the optional
 * properties declare.
 */
public record PersonDto(
        String id,
        String name,
        String avatarUrl,
        SectionRefDto section,
        /** An event both the viewer and this person joined, so their wall is reachable. */
        String wallEventId) {

    public PersonDto withWallEventId(String eventId) {
        return new PersonDto(id, name, avatarUrl, section, eventId);
    }
}
