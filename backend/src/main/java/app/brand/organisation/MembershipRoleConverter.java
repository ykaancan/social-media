package app.brand.organisation;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link MembershipRole} as the lowercase text the CHECK constraint allows. */
@Converter(autoApply = true)
public class MembershipRoleConverter implements AttributeConverter<MembershipRole, String> {

    @Override
    public String convertToDatabaseColumn(MembershipRole attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public MembershipRole convertToEntityAttribute(String dbData) {
        return dbData == null ? null : MembershipRole.of(dbData);
    }
}
