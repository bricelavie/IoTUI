//! Buffered logger that captures log messages into a ring buffer
//! so the frontend can poll and display them.
//!
//! Log entries are *never* removed from the buffer by polling. Instead, a
//! monotonically-increasing `LOG_CURSOR` counts total entries ever written.
//! Callers pass the cursor value they last saw; the logger returns only the
//! entries written since that point (up to the ring-buffer capacity).

use chrono::Utc;
use log::{LevelFilter, Log, Metadata, Record};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

const MAX_LOG_ENTRIES: usize = 10_000;

/// A single captured log entry, serializable for the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct BackendLogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

/// Global ring buffer holding captured log messages.
static LOG_BUFFER: OnceLock<Mutex<VecDeque<BackendLogEntry>>> = OnceLock::new();
/// Global atomic storing the current level as a usize (log::LevelFilter discriminant).
static LOG_LEVEL: OnceLock<AtomicUsize> = OnceLock::new();
/// Total entries ever pushed (monotonically increasing).
static LOG_CURSOR: OnceLock<AtomicUsize> = OnceLock::new();

fn buffer() -> &'static Mutex<VecDeque<BackendLogEntry>> {
    LOG_BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_LOG_ENTRIES)))
}

fn level_store() -> &'static AtomicUsize {
    LOG_LEVEL.get_or_init(|| AtomicUsize::new(LevelFilter::Info as usize))
}

fn cursor_store() -> &'static AtomicUsize {
    LOG_CURSOR.get_or_init(|| AtomicUsize::new(0))
}

/// Our custom logger implementation.
struct BufferedLogger;

impl Log for BufferedLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        let current = level_store().load(Ordering::Relaxed);
        (metadata.level() as usize) <= current
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

        // Also print to stderr for development
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
        // Increment *after* pushing so the cursor always reflects entries in the buffer.
        cursor_store().fetch_add(1, Ordering::Relaxed);
    }

    fn flush(&self) {}
}

/// Initialize the buffered logger as the global logger.
/// Call this once at startup instead of `env_logger::init()`.
pub fn init(level: LevelFilter) {
    level_store().store(level as usize, Ordering::Relaxed);
    log::set_boxed_logger(Box::new(BufferedLogger)).expect("Failed to set logger");
    log::set_max_level(level);
}

/// Return log entries written since `cursor` without removing them from the buffer.
///
/// On the first call pass `cursor = 0`; subsequent calls should pass the
/// `new_cursor` returned by the previous call.  Returns `(entries, new_cursor)`.
pub fn drain_logs_since(cursor: usize) -> (Vec<BackendLogEntry>, usize) {
    let buf = buffer().lock();
    let total = cursor_store().load(Ordering::Relaxed);

    if total <= cursor {
        return (Vec::new(), cursor);
    }

    // How many entries are still in the ring buffer?
    let in_buf = buf.len();
    // How many entries were written since `cursor`?
    let new_count = total - cursor;
    // We can only return entries that are still in the ring buffer.
    // If `new_count > in_buf`, some entries have been evicted; start from the oldest available.
    let take = new_count.min(in_buf);
    let skip = in_buf.saturating_sub(take);

    let entries: Vec<BackendLogEntry> = buf.iter().skip(skip).cloned().collect();
    (entries, total)
}

/// Get the current log level filter.
pub fn current_level() -> LevelFilter {
    log::max_level()
}

/// Change the log level filter at runtime.
pub fn set_level(level: LevelFilter) {
    level_store().store(level as usize, Ordering::Relaxed);
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
