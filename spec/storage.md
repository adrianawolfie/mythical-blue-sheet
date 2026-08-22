# Storage Boundary

Package: `pkg/storage`

Storage is not an API domain, but it is the persistence boundary used by every repository. The `storage.Storage` interface provides reader, writer, and delete behavior. Local storage and S3 storage are interchangeable implementations selected at startup.

Character history uses immutable UUIDv7-addressed objects over this boundary. Current configuration, live state, and history metadata remain explicit objects because `storage.Storage` does not provide object listing, transactions, or conditional writes.
