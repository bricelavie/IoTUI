use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};

// ─── Register Storage ────────────────────────────────────────────

/// Number of addresses per register type in the simulated device.
const SIM_REGISTER_COUNT: usize = 1000;

/// Shared register file that the background simulation task mutates.
struct RegisterFile {
    coils: Vec<bool>,
    discrete_inputs: Vec<bool>,
    input_registers: Vec<u16>,
    holding_registers: Vec<u16>,
}

impl RegisterFile {
    fn new() -> Self {
        let mut rf = Self {
            coils: vec![false; SIM_REGISTER_COUNT],
            discrete_inputs: vec![false; SIM_REGISTER_COUNT],
            input_registers: vec![0u16; SIM_REGISTER_COUNT],
            holding_registers: vec![0u16; SIM_REGISTER_COUNT],
        };
        rf.seed_initial_values();
        rf
    }

    /// Pre-populate registers with realistic industrial defaults.
    fn seed_initial_values(&mut self) {
        // ── Input Registers (read-only sensors) ──────────────────
        // 0–9: Temperature sensors (×10, e.g. 225 = 22.5 °C)
        let temps = [225, 231, 198, 245, 220, 215, 238, 202, 210, 227];
        for (i, &v) in temps.iter().enumerate() {
            self.input_registers[i] = v;
        }

        // 10–19: Pressure sensors (×100, e.g. 10132 = 101.32 kPa)
        let pressures = [10132, 10145, 10098, 10200, 10150, 10125, 10180, 10110, 10165, 10142];
        for (i, &v) in pressures.iter().enumerate() {
            self.input_registers[10 + i] = v;
        }

        // 20–29: Flow rates (L/min × 10)
        let flows = [1250, 1380, 980, 1100, 1450, 1200, 1050, 1320, 1180, 1290];
        for (i, &v) in flows.iter().enumerate() {
            self.input_registers[20 + i] = v;
        }

        // 30–34: Humidity sensors (% × 10)
        let humidity = [452, 480, 435, 468, 445];
        for (i, &v) in humidity.iter().enumerate() {
            self.input_registers[30 + i] = v;
        }

        // ── Holding Registers (read/write setpoints) ─────────────
        // 0–9: Temperature setpoints (×10)
        let setpoints = [250, 250, 200, 250, 220, 220, 240, 200, 210, 230];
        for (i, &v) in setpoints.iter().enumerate() {
            self.holding_registers[i] = v;
        }

        // 10–14: PID P/I/D/min/max
        self.holding_registers[10] = 100; // Kp × 10
        self.holding_registers[11] = 50;  // Ki × 10
        self.holding_registers[12] = 25;  // Kd × 10
        self.holding_registers[13] = 0;   // output min
        self.holding_registers[14] = 1000; // output max

        // 15–19: Alarm thresholds
        self.holding_registers[15] = 350; // high temp alarm (×10)
        self.holding_registers[16] = 50;  // low temp alarm (×10)
        self.holding_registers[17] = 10500; // high pressure alarm (×100)
        self.holding_registers[18] = 9800;  // low pressure alarm (×100)
        self.holding_registers[19] = 2000;  // high flow alarm (×10)

        // ── Coils (read/write controls) ──────────────────────────
        // 0–4: Motor run/stop (initially 3 running)
        self.coils[0] = true;
        self.coils[1] = true;
        self.coils[2] = true;
        self.coils[3] = false;
        self.coils[4] = false;
        // 5–9: Valve open/close
        self.coils[5] = true;
        self.coils[6] = true;
        self.coils[7] = false;
        self.coils[8] = true;
        self.coils[9] = false;

        // ── Discrete Inputs (read-only status) ──────────────────
        // 0–4: Motor running confirmation
        self.discrete_inputs[0] = true;
        self.discrete_inputs[1] = true;
        self.discrete_inputs[2] = true;
        self.discrete_inputs[3] = false;
        self.discrete_inputs[4] = false;
        // 5–9: Limit switches / safety interlocks
        self.discrete_inputs[5] = false; // no alarm
        self.discrete_inputs[6] = false;
        self.discrete_inputs[7] = false;
        self.discrete_inputs[8] = false;
        self.discrete_inputs[9] = false;
    }
}

type SharedRegisterFile = Arc<RwLock<RegisterFile>>;

// ─── Simulator ───────────────────────────────────────────────────

pub struct ModbusSimulator {
    registers: SharedRegisterFile,
    sim_handle: Option<JoinHandle<()>>,
    cancelled: Arc<AtomicBool>,
}

impl ModbusSimulator {
    pub fn new() -> Self {
        let registers = Arc::new(RwLock::new(RegisterFile::new()));
        let cancelled = Arc::new(AtomicBool::new(false));

        let sim_registers = registers.clone();
        let sim_cancelled = cancelled.clone();
        let sim_handle = tokio::spawn(async move {
            Self::simulation_loop(sim_registers, sim_cancelled).await;
        });

        Self {
            registers,
            sim_handle: Some(sim_handle),
            cancelled,
        }
    }

    /// Background loop that updates simulated sensor values every 500ms.
    async fn simulation_loop(registers: SharedRegisterFile, cancelled: Arc<AtomicBool>) {
        let mut tick: u64 = 0;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if cancelled.load(Ordering::Relaxed) {
                log::debug!("Modbus simulator loop: cancellation requested, exiting");
                break;
            }
            tick += 1;

            let mut rf = registers.write().await;

            // Temperature sensors: gentle sine-wave drift around baseline
            for i in 0..10 {
                let base = match i {
                    0 => 225.0,
                    1 => 231.0,
                    2 => 198.0,
                    3 => 245.0,
                    4 => 220.0,
                    5 => 215.0,
                    6 => 238.0,
                    7 => 202.0,
                    8 => 210.0,
                    _ => 227.0,
                };
                let phase = (tick as f64 + i as f64 * 7.0) * 0.05;
                let noise = (phase.sin() * 15.0) + ((phase * 2.3).cos() * 5.0);
                rf.input_registers[i] = (base + noise).max(0.0) as u16;
            }

            // Pressure sensors: slow oscillation
            for i in 0..10 {
                let base = 10132.0 + (i as f64) * 12.0;
                let phase = (tick as f64 + i as f64 * 11.0) * 0.03;
                let noise = (phase.sin() * 50.0) + ((phase * 1.7).cos() * 20.0);
                rf.input_registers[10 + i] = (base + noise).max(0.0) as u16;
            }

            // Flow rates: moderate variation
            for i in 0..10 {
                let base = match i {
                    0 => 1250.0,
                    1 => 1380.0,
                    2 => 980.0,
                    3 => 1100.0,
                    4 => 1450.0,
                    5 => 1200.0,
                    6 => 1050.0,
                    7 => 1320.0,
                    8 => 1180.0,
                    _ => 1290.0,
                };
                let phase = (tick as f64 + i as f64 * 13.0) * 0.04;
                let noise = (phase.sin() * 80.0) + ((phase * 1.1).cos() * 30.0);
                rf.input_registers[20 + i] = (base + noise).max(0.0) as u16;
            }

            // Humidity: slow drift
            for i in 0..5 {
                let base = 450.0 + (i as f64) * 8.0;
                let phase = (tick as f64 + i as f64 * 17.0) * 0.02;
                let noise = (phase.sin() * 20.0) + ((phase * 0.7).cos() * 10.0);
                rf.input_registers[30 + i] = (base + noise).max(0.0).min(1000.0) as u16;
            }

            // Discrete inputs: mirror coil state for motor confirmation
            for i in 0..5 {
                rf.discrete_inputs[i] = rf.coils[i];
            }

            // Every 30 ticks (~15 seconds), toggle a random alarm briefly
            if tick % 30 == 0 {
                let alarm_idx = 5 + ((tick / 30) % 5) as usize;
                rf.discrete_inputs[alarm_idx] = true;
            } else if tick % 30 == 4 {
                // Clear alarm after 2 seconds
                for i in 5..10 {
                    rf.discrete_inputs[i] = false;
                }
            }
        }
    }

    // ─── Read Operations ─────────────────────────────────────────

    pub async fn read_coils(&self, start: u16, count: u16) -> AppResult<Vec<bool>> {
        let rf = self.registers.read().await;
        Self::validate_range(start, count, SIM_REGISTER_COUNT, "Coil")?;
        let s = start as usize;
        let c = count as usize;
        Ok(rf.coils[s..s + c].to_vec())
    }

    pub async fn read_discrete_inputs(&self, start: u16, count: u16) -> AppResult<Vec<bool>> {
        let rf = self.registers.read().await;
        Self::validate_range(start, count, SIM_REGISTER_COUNT, "Discrete Input")?;
        let s = start as usize;
        let c = count as usize;
        Ok(rf.discrete_inputs[s..s + c].to_vec())
    }

    pub async fn read_holding_registers(&self, start: u16, count: u16) -> AppResult<Vec<u16>> {
        let rf = self.registers.read().await;
        Self::validate_range(start, count, SIM_REGISTER_COUNT, "Holding Register")?;
        let s = start as usize;
        let c = count as usize;
        Ok(rf.holding_registers[s..s + c].to_vec())
    }

    pub async fn read_input_registers(&self, start: u16, count: u16) -> AppResult<Vec<u16>> {
        let rf = self.registers.read().await;
        Self::validate_range(start, count, SIM_REGISTER_COUNT, "Input Register")?;
        let s = start as usize;
        let c = count as usize;
        Ok(rf.input_registers[s..s + c].to_vec())
    }

    // ─── Write Operations ────────────────────────────────────────

    pub async fn write_coils(&self, start: u16, values: &[bool]) -> AppResult<()> {
        let mut rf = self.registers.write().await;
        Self::validate_range(start, values.len() as u16, SIM_REGISTER_COUNT, "Coil")?;
        let s = start as usize;
        for (i, &v) in values.iter().enumerate() {
            rf.coils[s + i] = v;
        }
        Ok(())
    }

    pub async fn write_holding_registers(&self, start: u16, values: &[u16]) -> AppResult<()> {
        let mut rf = self.registers.write().await;
        Self::validate_range(start, values.len() as u16, SIM_REGISTER_COUNT, "Holding Register")?;
        let s = start as usize;
        for (i, &v) in values.iter().enumerate() {
            rf.holding_registers[s + i] = v;
        }
        Ok(())
    }

    // ─── Helpers ─────────────────────────────────────────────────

    fn validate_range(start: u16, count: u16, max: usize, label: &str) -> AppResult<()> {
        if count == 0 {
            return Err(AppError::modbus(format!(
                "{label} read/write count must be > 0"
            )));
        }
        let end = start as usize + count as usize;
        if end > max {
            return Err(AppError::modbus(format!(
                "{label} address range {start}..{end} exceeds simulator capacity ({max})"
            )));
        }
        Ok(())
    }
}

impl Drop for ModbusSimulator {
    fn drop(&mut self) {
        // Signal the loop to stop cooperatively
        self.cancelled.store(true, Ordering::Relaxed);
        // Abort as a fallback in case the loop is blocked on the sleep
        if let Some(handle) = self.sim_handle.take() {
            handle.abort();
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn read_initial_temperatures() {
        let sim = ModbusSimulator::new();
        let vals = sim.read_input_registers(0, 10).await.unwrap();
        assert_eq!(vals.len(), 10);
        // Initial values should be seeded (before sim loop changes them)
        // They may have already shifted slightly due to the 500ms loop,
        // but should be in a reasonable range.
        for &v in &vals {
            assert!(v < 500, "Temperature value {v} out of expected range");
        }
    }

    #[tokio::test]
    async fn read_initial_coils() {
        let sim = ModbusSimulator::new();
        let coils = sim.read_coils(0, 5).await.unwrap();
        assert_eq!(coils.len(), 5);
        // Motors 0,1,2 should be ON initially
        assert!(coils[0]);
        assert!(coils[1]);
        assert!(coils[2]);
    }

    #[tokio::test]
    async fn write_and_read_holding() {
        let sim = ModbusSimulator::new();
        sim.write_holding_registers(100, &[1234, 5678]).await.unwrap();
        let vals = sim.read_holding_registers(100, 2).await.unwrap();
        assert_eq!(vals, vec![1234, 5678]);
    }

    #[tokio::test]
    async fn write_and_read_coils() {
        let sim = ModbusSimulator::new();
        sim.write_coils(50, &[true, false, true]).await.unwrap();
        let vals = sim.read_coils(50, 3).await.unwrap();
        assert_eq!(vals, vec![true, false, true]);
    }

    #[tokio::test]
    async fn out_of_range_returns_error() {
        let sim = ModbusSimulator::new();
        let result = sim.read_coils(990, 20).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn zero_count_returns_error() {
        let sim = ModbusSimulator::new();
        let result = sim.read_input_registers(0, 0).await;
        assert!(result.is_err());
    }
}
