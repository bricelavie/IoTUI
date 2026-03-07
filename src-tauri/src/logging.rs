//! Buffered logger that captures log messages into a ring buffer
//! so the frontend can poll and display them.

use chrono::Utc;
use log::{LevelFilter, Log, Metadata, Record};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::OnceLock;

const MAX_LOG_ENTRIES: usize = 10_000;

/// A single captured log entry, serializable for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendLogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

/// Global ring buffer holding captured log messages.
static LOG_BUFFER: OnceLock<Mutex<VecDeque<BackendLogEntry>>> = OnceLock::new();

fn buffer() -> &'static Mutex<VecDeque<BackendLogEntry>> {
    LOG_BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_LOG_ENTRIES)))
}

/// Our custom logger implementation.
struct BufferedLogger {
    level: LevelFilter,
}

impl Log for BufferedLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let entry = BackendLogEntry {
            timestamp: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            level: record.level().to_string().to_lowercase(),
            target: record.target().to_string(),
            message: format!("{}", record.args()),
        };

        // Also print to stderr for development (like env_logger would)
        eprintln!(
            "[{}] {} [{}] {}",
            entry.timestamp,
            record.level(),
            entry.target,
            entry.message
        );

        let mut buf = buffer().lock();
        if buf.len() >= MAX_LOG_ENTRIES {
            buf.pop_front();
        }
        buf.push_back(entry);
    }

    fn flush(&self) {}
}

/// Initialize the buffered logger as the global logger.
/// Call this once at startup instead of `env_logger::init()`.
pub fn init(level: LevelFilter) {
    let logger = BufferedLogger { level };
    log::set_boxed_logger(Box::new(logger)).expect("Failed to set logger");
    log::set_max_level(level);
}

/// Drain all buffered log entries, returning them and clearing the buffer.
pub fn drain_logs() -> Vec<BackendLogEntry> {
    let mut buf = buffer().lock();
    buf.drain(..).collect()
}

/// Get the current log level filter.
pub fn current_level() -> LevelFilter {
    log::max_level()
}

/// Change the log level filter at runtime.
pub fn set_level(level: LevelFilter) {
    log::set_max_level(level);
}

/// Parse a level string into a LevelFilter.
pub fn parse_level(s: &str) -> LevelFilter {
    match s.to_lowercase().as_str() {
        "trace" => LevelFilter::Trace,
        "debug" => LevelFilter::Debug,
        "info" => LevelFilter::Info,
        "warn" => LevelFilter::Warn,
        "error" => LevelFilter::Error,
        "off" => LevelFilter::Off,
        _ => LevelFilter::Info,
    }
}
