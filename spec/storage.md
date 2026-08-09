# Storage Boundary

Package: `pkg/storage`

Storage is not an API domain, but it is the persistence boundary used by every repository. The `storage.Storage` interface provides reader, writer, and delete behavior. Local storage and S3 storage are interchangeable implementations selected at startup.
