package app.brand.user;

/**
 * {@code SectionRef} in {@code types.ts}. [D11] The country rides along with the
 * section and is never sent as a field of its own.
 */
public record SectionRefDto(String id, String name, String country) {
}
