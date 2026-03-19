use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::sync::Mutex;
use tokio_modbus::client::tcp::connect_slave;
use tokio_modbus::prelude::*;

use crate::error::{AppError, AppResult};
use super::types::ModbusConnectionConfig;

/// Default request timeout if none configured.
const DEFAULT_TIMEOUT_MS: u64 = 3000;

// ─── ModbusClientConnection ──────────────────────────────────────

pub struct ModbusClientConnection {
    ctx: Arc<Mutex<tokio_modbus::client::Context>>,
    connected: Arc<AtomicBool>,
    timeout: Duration,
}

impl ModbusClientConnection {
    pub async fn connect(config: &ModbusConnectionConfig) -> AppResult<Self> {
        let addr: SocketAddr = format!("{}:{}", config.host, config.port)
            .parse()
            .map_err(|e| AppError::modbus(format!("Invalid address: {e}")))?;

        let timeout = Duration::from_millis(
            config.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS as u32) as u64,
        );

        log::info!(
            "Modbus: connecting to {} (unit {})",
            addr,
            config.unit_id
        );

        let ctx = tokio::time::timeout(timeout, connect_slave(addr, Slave(config.unit_id)))
            .await
            .map_err(|_| {
                AppError::modbus(format!(
                    "Connection to {addr} timed out after {}ms",
                    timeout.as_millis()
                ))
            })?
            .map_err(|e| {
                AppError::modbus(format!("Connection to {addr} failed: {e}"))
            })?;

        log::info!(
            "Modbus: connected to {} (unit {})",
            addr,
            config.unit_id
        );

        Ok(Self {
            ctx: Arc::new(Mutex::new(ctx)),
            connected: Arc::new(AtomicBool::new(true)),
            timeout,
        })
    }

    // ─── Read Operations ─────────────────────────────────────────

    pub async fn read_coils(&self, start: u16, count: u16) -> AppResult<Vec<bool>> {
        let mut ctx = self.ctx.lock().await;
        let result = tokio::time::timeout(self.timeout, ctx.read_coils(start, count))
            .await
            .map_err(|_| { self.mark_disconnected(); AppError::modbus("Read coils timed out") })?
            .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Read coils failed: {e}")) })?;
        result.map_err(|e| AppError::modbus(format!("Read coils exception: {e:?}")))
    }

    pub async fn read_discrete_inputs(&self, start: u16, count: u16) -> AppResult<Vec<bool>> {
        let mut ctx = self.ctx.lock().await;
        let result = tokio::time::timeout(self.timeout, ctx.read_discrete_inputs(start, count))
            .await
            .map_err(|_| { self.mark_disconnected(); AppError::modbus("Read discrete inputs timed out") })?
            .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Read discrete inputs failed: {e}")) })?;
        result.map_err(|e| AppError::modbus(format!("Read discrete inputs exception: {e:?}")))
    }

    pub async fn read_holding_registers(&self, start: u16, count: u16) -> AppResult<Vec<u16>> {
        let mut ctx = self.ctx.lock().await;
        let result = tokio::time::timeout(
            self.timeout,
            ctx.read_holding_registers(start, count),
        )
        .await
        .map_err(|_| { self.mark_disconnected(); AppError::modbus("Read holding registers timed out") })?
        .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Read holding registers failed: {e}")) })?;
        result.map_err(|e| AppError::modbus(format!("Read holding registers exception: {e:?}")))
    }

    pub async fn read_input_registers(&self, start: u16, count: u16) -> AppResult<Vec<u16>> {
        let mut ctx = self.ctx.lock().await;
        let result = tokio::time::timeout(
            self.timeout,
            ctx.read_input_registers(start, count),
        )
        .await
        .map_err(|_| { self.mark_disconnected(); AppError::modbus("Read input registers timed out") })?
        .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Read input registers failed: {e}")) })?;
        result.map_err(|e| AppError::modbus(format!("Read input registers exception: {e:?}")))
    }

    // ─── Write Operations ────────────────────────────────────────

    pub async fn write_single_coil(&self, addr: u16, value: bool) -> AppResult<()> {
        let mut ctx = self.ctx.lock().await;
        tokio::time::timeout(self.timeout, ctx.write_single_coil(addr, value))
            .await
            .map_err(|_| { self.mark_disconnected(); AppError::modbus("Write single coil timed out") })?
            .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Write single coil failed: {e}")) })?
            .map_err(|e| AppError::modbus(format!("Write single coil exception: {e:?}")))
    }

    pub async fn write_multiple_coils(&self, start: u16, values: &[bool]) -> AppResult<()> {
        let mut ctx = self.ctx.lock().await;
        tokio::time::timeout(self.timeout, ctx.write_multiple_coils(start, values))
            .await
            .map_err(|_| { self.mark_disconnected(); AppError::modbus("Write multiple coils timed out") })?
            .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Write multiple coils failed: {e}")) })?
            .map_err(|e| AppError::modbus(format!("Write multiple coils exception: {e:?}")))
    }

    pub async fn write_single_register(&self, addr: u16, value: u16) -> AppResult<()> {
        let mut ctx = self.ctx.lock().await;
        tokio::time::timeout(self.timeout, ctx.write_single_register(addr, value))
            .await
            .map_err(|_| { self.mark_disconnected(); AppError::modbus("Write single register timed out") })?
            .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Write single register failed: {e}")) })?
            .map_err(|e| AppError::modbus(format!("Write single register exception: {e:?}")))
    }

    pub async fn write_multiple_registers(&self, start: u16, values: &[u16]) -> AppResult<()> {
        let mut ctx = self.ctx.lock().await;
        tokio::time::timeout(
            self.timeout,
            ctx.write_multiple_registers(start, values),
        )
        .await
        .map_err(|_| { self.mark_disconnected(); AppError::modbus("Write multiple registers timed out") })?
        .map_err(|e| { self.mark_disconnected(); AppError::modbus(format!("Write multiple registers failed: {e}")) })?
        .map_err(|e| AppError::modbus(format!("Write multiple registers exception: {e:?}")))
    }

    // ─── Connection State ────────────────────────────────────────

    /// Mark connection as lost (called on transport-level errors).
    fn mark_disconnected(&self) {
        self.connected.store(false, Ordering::Relaxed);
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    pub async fn disconnect(&self) -> AppResult<()> {
        self.connected.store(false, Ordering::Relaxed);
        let mut ctx = self.ctx.lock().await;
        if let Err(e) = ctx.disconnect().await {
            log::warn!("Modbus: disconnect error: {e}");
        }
        log::info!("Modbus: disconnected");
        Ok(())
    }
}
