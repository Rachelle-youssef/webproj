# LifeLink entity-relationship diagram

16 tables, 27 foreign keys, 13 check constraints. Open this file in VS Code's Markdown preview or on GitHub to see the diagram.
The `reviewed_by` and `created_by` links to `users` (the admin who made a decision) are left out of the picture to keep it readable; they are in `schema.sql`.

```mermaid
erDiagram
    roles ||--o{ users : "role of"
    users ||--o{ sessions : "signed-in browsers"
    users ||--o| donor_profiles : "donor details"
    blood_types ||--o{ donor_profiles : "blood type"
    blood_types ||--o{ blood_compatibility : "can give"
    blood_types ||--o{ blood_compatibility : "can receive"
    users ||--o{ blood_requests : "asks for blood"
    blood_types ||--o{ blood_requests : "type needed"
    users ||--o{ blood_donations : "donates"
    blood_requests |o--o{ blood_donations : "answered by"
    blood_types ||--|| blood_stock : "stock level"
    blood_types ||--o{ blood_stock_movements : "stock change"
    blood_donations |o--o{ blood_stock_movements : "adds units"
    blood_requests |o--o{ blood_stock_movements : "receives units"
    users ||--o{ medicine_calls : "appeals"
    users ||--o{ medicines : "donates"
    medicine_categories ||--o{ medicines : "groups"
    medicine_calls |o--o{ medicines : "answered by"
    users ||--o{ medicine_requests : "asks for medicine"
    medicines ||--o{ medicine_requests : "requested"
    users ||--o{ notifications : "receives"
    users |o--o{ audit_logs : "acts"

    sessions {
        char id_hash PK
        int user_id FK
        int session_version
        datetime expires_at
        mediumtext data
    }
    roles {
        tinyint id PK
        varchar name UK
    }
    blood_types {
        tinyint id PK
        varchar label UK
    }
    blood_compatibility {
        tinyint donor_blood_type_id PK, FK
        tinyint recipient_blood_type_id PK, FK
    }
    medicine_categories {
        tinyint id PK
        varchar name UK
    }
    users {
        int id PK
        tinyint role_id FK
        varchar full_name
        varchar email UK
        varchar password_hash
        varchar phone
        varchar city
        decimal latitude
        decimal longitude
        boolean is_active
        int session_version
        datetime created_at
        datetime updated_at
    }
    donor_profiles {
        int user_id PK, FK
        tinyint blood_type_id FK
        date last_donation_date
        boolean is_available
    }
    blood_requests {
        int id PK
        int requester_id FK
        tinyint blood_type_id FK
        tinyint units_needed
        tinyint units_received
        boolean has_hospital_pin
        enum urgency "normal, urgent, sos"
        varchar hospital_name
        varchar city
        enum status "pending, open, fulfilled, cancelled"
        varchar admin_note
        int reviewed_by FK
    }
    blood_donations {
        int id PK
        int donor_id FK
        int request_id FK "NULL for an independent offer"
        enum status "invited, pending, accepted, completed, declined, cancelled"
        datetime accepted_at
        varchar admin_note
        int reviewed_by FK
    }
    blood_stock {
        tinyint blood_type_id PK, FK
        smallint units_available
    }
    blood_stock_movements {
        int id PK
        tinyint blood_type_id FK
        smallint change_units
        enum reason "donation, dispensed, adjustment"
        int donation_id FK
        int request_id FK
        int created_by FK
    }
    medicine_calls {
        int id PK
        int created_by FK
        varchar medicine_name
        int quantity
        enum status "open, closed"
    }
    medicines {
        int id PK
        int donor_id FK
        tinyint category_id FK
        int call_id FK
        varchar name
        int quantity_donated
        int quantity_available
        date expiry_date
        enum status "pending, approved, rejected, expired, dispensed"
        int reviewed_by FK
    }
    medicine_requests {
        int id PK
        int requester_id FK
        int medicine_id FK
        int quantity
        enum status "pending, approved, rejected, cancelled"
        int reviewed_by FK
    }
    notifications {
        int id PK
        int user_id FK
        enum type
        varchar message
        varchar link
        boolean is_read
    }
    audit_logs {
        bigint id PK
        int user_id FK
        varchar action
        varchar entity
        int entity_id
        varchar ip_address
    }
```
