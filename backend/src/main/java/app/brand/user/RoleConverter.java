package app.brand.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link Role} as the lowercase text the CHECK constraint allows. */
@Converter(autoApply = true)
public class RoleConverter implements AttributeConverter<Role, String> {

    @Override
    public String convertToDatabaseColumn(Role attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public Role convertToEntityAttribute(String dbData) {
        return dbData == null ? null : Role.of(dbData);
    }
}
