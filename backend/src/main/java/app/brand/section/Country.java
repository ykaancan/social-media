package app.brand.section;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * [D11] A country is never a field of a person. It is reached only through the
 * user's section and means where they sit in the network, not their nationality.
 */
@Entity
@Table(name = "country")
public class Country {

    @Id
    @Column(name = "code", nullable = false)
    private String code;

    @Column(name = "name", nullable = false)
    private String name;

    protected Country() {
    }

    public String getCode() {
        return code;
    }

    /** The display string the app shows, e.g. "Türkiye". */
    public String getName() {
        return name;
    }
}
