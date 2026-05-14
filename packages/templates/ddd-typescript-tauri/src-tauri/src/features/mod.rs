// Aggregator for all backend features. Each child module owns its own
// pipeline; only `mod.rs` of each feature is part of the public API.
pub mod shared;
pub mod tasks;
