use chrono::Utc;
use rand::Rng;
use std::collections::HashMap;

use super::types::*;

/// Simulates a realistic OPC UA server address space with industrial data
pub struct OpcUaSimulator {
    /// Simulated writable values
    writable_values: parking_lot::Mutex<HashMap<String, String>>,
    /// Base time for simulation
    start_time: chrono::DateTime<Utc>,
    /// Event counter for unique IDs
    event_counter: std::sync::atomic::AtomicU64,
}

impl OpcUaSimulator {
    pub fn new() -> Self {
        Self {
            writable_values: parking_lot::Mutex::new(HashMap::new()),
            start_time: Utc::now(),
            event_counter: std::sync::atomic::AtomicU64::new(1),
        }
    }

    fn now_str(&self) -> String {
        Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
    }

    fn elapsed_secs(&self) -> f64 {
        (Utc::now() - self.start_time).num_milliseconds() as f64 / 1000.0
    }

    /// Discover endpoints for a simulated server
    pub fn discover_endpoints(&self, url: &str) -> Vec<EndpointInfo> {
        vec![
            EndpointInfo {
                url: url.to_string(),
                security_policy: "None".to_string(),
                security_mode: "None".to_string(),
                user_identity_tokens: vec![
                    UserTokenInfo {
                        policy_id: "anonymous".to_string(),
                        token_type: "Anonymous".to_string(),
                    },
                    UserTokenInfo {
                        policy_id: "username".to_string(),
                        token_type: "UserName".to_string(),
                    },
                ],
            },
            EndpointInfo {
                url: url.to_string(),
                security_policy: "Basic256Sha256".to_string(),
                security_mode: "SignAndEncrypt".to_string(),
                user_identity_tokens: vec![
                    UserTokenInfo {
                        policy_id: "anonymous".to_string(),
                        token_type: "Anonymous".to_string(),
                    },
                    UserTokenInfo {
                        policy_id: "username".to_string(),
                        token_type: "UserName".to_string(),
                    },
                    UserTokenInfo {
                        policy_id: "certificate".to_string(),
                        token_type: "Certificate".to_string(),
                    },
                ],
            },
            EndpointInfo {
                url: url.to_string(),
                security_policy: "Aes128_Sha256_RsaOaep".to_string(),
                security_mode: "Sign".to_string(),
                user_identity_tokens: vec![UserTokenInfo {
                    policy_id: "username".to_string(),
                    token_type: "UserName".to_string(),
                }],
            },
        ]
    }

    /// Browse children of a node in the simulated address space
    pub fn browse(&self, node_id: &str) -> Vec<BrowseNode> {
        match node_id {
            // Root node
            "i=84" | "ns=0;i=84" => vec![
                node_obj("ns=0;i=85", "0:Objects", "Objects"),
                node_obj("ns=0;i=86", "0:Types", "Types"),
                node_obj("ns=0;i=87", "0:Views", "Views"),
            ],
            // Objects folder
            "ns=0;i=85" | "i=85" => vec![
                node_obj("ns=0;i=2253", "0:Server", "Server"),
                node_obj("ns=2;s=Plant", "2:Plant", "Plant"),
            ],
            // Server object
            "ns=0;i=2253" => vec![
                node_var("ns=0;i=2254", "0:ServerArray", "ServerArray"),
                node_var("ns=0;i=2255", "0:NamespaceArray", "NamespaceArray"),
                node_obj("ns=0;i=2256", "0:ServerStatus", "ServerStatus"),
                node_var("ns=0;i=2267", "0:ServiceLevel", "ServiceLevel"),
                node_var("ns=0;i=2994", "0:Auditing", "Auditing"),
            ],
            // Server Status
            "ns=0;i=2256" => vec![
                node_var("ns=0;i=2257", "0:StartTime", "StartTime"),
                node_var("ns=0;i=2258", "0:CurrentTime", "CurrentTime"),
                node_var("ns=0;i=2259", "0:State", "State"),
                node_var("ns=0;i=2260", "0:BuildInfo", "BuildInfo"),
                node_var(
                    "ns=0;i=2992",
                    "0:SecondsTillShutdown",
                    "SecondsTillShutdown",
                ),
                node_var("ns=0;i=2993", "0:ShutdownReason", "ShutdownReason"),
            ],
            // ═══ PLANT ═══
            "ns=2;s=Plant" => vec![
                node_obj("ns=2;s=Line1", "2:ProductionLine1", "Production Line 1"),
                node_obj("ns=2;s=Line2", "2:ProductionLine2", "Production Line 2"),
                node_obj("ns=2;s=Utilities", "2:Utilities", "Utilities"),
                node_obj("ns=2;s=Quality", "2:QualityControl", "Quality Control"),
            ],
            // ═══ PRODUCTION LINE 1 ═══
            "ns=2;s=Line1" => vec![
                node_obj("ns=2;s=Line1.Robot1", "2:Robot1", "Robot Arm #1"),
                node_obj("ns=2;s=Line1.Robot2", "2:Robot2", "Robot Arm #2"),
                node_obj("ns=2;s=Line1.Conveyor", "2:Conveyor", "Conveyor Belt"),
                node_obj("ns=2;s=Line1.PLC", "2:PLC", "PLC Controller"),
                node_var("ns=2;s=Line1.Status", "2:LineStatus", "Line Status"),
                node_var(
                    "ns=2;s=Line1.ProductCount",
                    "2:ProductCount",
                    "Product Count",
                ),
                node_var(
                    "ns=2;s=Line1.OEE",
                    "2:OEE",
                    "Overall Equipment Effectiveness",
                ),
                node_var("ns=2;s=Line1.CycleTime", "2:CycleTime", "Cycle Time"),
            ],
            // Robot Arm #1
            "ns=2;s=Line1.Robot1" => vec![
                node_var("ns=2;s=Line1.Robot1.Temp", "2:Temperature", "Temperature"),
                node_var("ns=2;s=Line1.Robot1.Speed", "2:MotorSpeed", "Motor Speed"),
                node_var("ns=2;s=Line1.Robot1.Torque", "2:Torque", "Torque"),
                node_var(
                    "ns=2;s=Line1.Robot1.Position",
                    "2:Position",
                    "Joint Position",
                ),
                node_var(
                    "ns=2;s=Line1.Robot1.Current",
                    "2:MotorCurrent",
                    "Motor Current",
                ),
                node_var(
                    "ns=2;s=Line1.Robot1.Vibration",
                    "2:Vibration",
                    "Vibration Level",
                ),
                node_var(
                    "ns=2;s=Line1.Robot1.Status",
                    "2:OperatingStatus",
                    "Operating Status",
                ),
                node_var(
                    "ns=2;s=Line1.Robot1.Hours",
                    "2:OperatingHours",
                    "Operating Hours",
                ),
                node_var("ns=2;s=Line1.Robot1.Errors", "2:ErrorCount", "Error Count"),
                node_method("ns=2;s=Line1.Robot1.Reset", "2:Reset", "Reset"),
                node_method("ns=2;s=Line1.Robot1.Calibrate", "2:Calibrate", "Calibrate"),
            ],
            // Robot Arm #2
            "ns=2;s=Line1.Robot2" => vec![
                node_var("ns=2;s=Line1.Robot2.Temp", "2:Temperature", "Temperature"),
                node_var("ns=2;s=Line1.Robot2.Speed", "2:MotorSpeed", "Motor Speed"),
                node_var("ns=2;s=Line1.Robot2.Torque", "2:Torque", "Torque"),
                node_var(
                    "ns=2;s=Line1.Robot2.Position",
                    "2:Position",
                    "Joint Position",
                ),
                node_var(
                    "ns=2;s=Line1.Robot2.Current",
                    "2:MotorCurrent",
                    "Motor Current",
                ),
                node_var(
                    "ns=2;s=Line1.Robot2.Vibration",
                    "2:Vibration",
                    "Vibration Level",
                ),
                node_var(
                    "ns=2;s=Line1.Robot2.Status",
                    "2:OperatingStatus",
                    "Operating Status",
                ),
                node_var(
                    "ns=2;s=Line1.Robot2.Hours",
                    "2:OperatingHours",
                    "Operating Hours",
                ),
                node_var("ns=2;s=Line1.Robot2.Errors", "2:ErrorCount", "Error Count"),
                node_method("ns=2;s=Line1.Robot2.Reset", "2:Reset", "Reset"),
            ],
            // Conveyor Belt
            "ns=2;s=Line1.Conveyor" => vec![
                node_var("ns=2;s=Line1.Conveyor.Speed", "2:BeltSpeed", "Belt Speed"),
                node_var(
                    "ns=2;s=Line1.Conveyor.Load",
                    "2:CurrentLoad",
                    "Current Load",
                ),
                node_var(
                    "ns=2;s=Line1.Conveyor.Temp",
                    "2:MotorTemp",
                    "Motor Temperature",
                ),
                node_var("ns=2;s=Line1.Conveyor.Running", "2:IsRunning", "Is Running"),
                node_var(
                    "ns=2;s=Line1.Conveyor.TotalDist",
                    "2:TotalDistance",
                    "Total Distance",
                ),
                node_method("ns=2;s=Line1.Conveyor.Start", "2:Start", "Start"),
                node_method("ns=2;s=Line1.Conveyor.Stop", "2:Stop", "Stop"),
                node_method("ns=2;s=Line1.Conveyor.SetSpeed", "2:SetSpeed", "Set Speed"),
            ],
            // PLC
            "ns=2;s=Line1.PLC" => vec![
                node_var("ns=2;s=Line1.PLC.CpuLoad", "2:CpuLoad", "CPU Load"),
                node_var("ns=2;s=Line1.PLC.MemUsage", "2:MemoryUsage", "Memory Usage"),
                node_var(
                    "ns=2;s=Line1.PLC.CycleTime",
                    "2:ScanCycleTime",
                    "Scan Cycle Time",
                ),
                node_var("ns=2;s=Line1.PLC.IoStatus", "2:IOStatus", "I/O Status"),
                node_var(
                    "ns=2;s=Line1.PLC.FwVersion",
                    "2:FirmwareVersion",
                    "Firmware Version",
                ),
                node_var("ns=2;s=Line1.PLC.Uptime", "2:Uptime", "Uptime"),
            ],
            // ═══ PRODUCTION LINE 2 ═══
            "ns=2;s=Line2" => vec![
                node_obj("ns=2;s=Line2.CNC", "2:CNCMachine", "CNC Machine"),
                node_obj("ns=2;s=Line2.Press", "2:HydraulicPress", "Hydraulic Press"),
                node_obj("ns=2;s=Line2.Oven", "2:CuringOven", "Curing Oven"),
                node_var("ns=2;s=Line2.Status", "2:LineStatus", "Line Status"),
                node_var(
                    "ns=2;s=Line2.ProductCount",
                    "2:ProductCount",
                    "Product Count",
                ),
            ],
            // CNC Machine
            "ns=2;s=Line2.CNC" => vec![
                node_var(
                    "ns=2;s=Line2.CNC.SpindleSpeed",
                    "2:SpindleSpeed",
                    "Spindle Speed",
                ),
                node_var("ns=2;s=Line2.CNC.FeedRate", "2:FeedRate", "Feed Rate"),
                node_var(
                    "ns=2;s=Line2.CNC.SpindleTemp",
                    "2:SpindleTemp",
                    "Spindle Temperature",
                ),
                node_var(
                    "ns=2;s=Line2.CNC.CoolantTemp",
                    "2:CoolantTemp",
                    "Coolant Temperature",
                ),
                node_var(
                    "ns=2;s=Line2.CNC.CoolantLevel",
                    "2:CoolantLevel",
                    "Coolant Level",
                ),
                node_var("ns=2;s=Line2.CNC.ToolWear", "2:ToolWear", "Tool Wear %"),
                node_var(
                    "ns=2;s=Line2.CNC.PartProgram",
                    "2:ActiveProgram",
                    "Active Program",
                ),
                node_var(
                    "ns=2;s=Line2.CNC.PartsComplete",
                    "2:PartsComplete",
                    "Parts Complete",
                ),
                node_var("ns=2;s=Line2.CNC.Alarm", "2:AlarmActive", "Alarm Active"),
            ],
            // Hydraulic Press
            "ns=2;s=Line2.Press" => vec![
                node_var("ns=2;s=Line2.Press.Pressure", "2:Pressure", "Pressure"),
                node_var("ns=2;s=Line2.Press.Force", "2:Force", "Applied Force"),
                node_var(
                    "ns=2;s=Line2.Press.OilTemp",
                    "2:OilTemperature",
                    "Oil Temperature",
                ),
                node_var("ns=2;s=Line2.Press.OilLevel", "2:OilLevel", "Oil Level"),
                node_var(
                    "ns=2;s=Line2.Press.CycleCount",
                    "2:CycleCount",
                    "Cycle Count",
                ),
                node_var(
                    "ns=2;s=Line2.Press.Position",
                    "2:RamPosition",
                    "Ram Position",
                ),
            ],
            // Curing Oven
            "ns=2;s=Line2.Oven" => vec![
                node_var("ns=2;s=Line2.Oven.Temp", "2:Temperature", "Temperature"),
                node_var("ns=2;s=Line2.Oven.SetPoint", "2:SetPoint", "Set Point"),
                node_var("ns=2;s=Line2.Oven.Humidity", "2:Humidity", "Humidity"),
                node_var("ns=2;s=Line2.Oven.FanSpeed", "2:FanSpeed", "Fan Speed"),
                node_var("ns=2;s=Line2.Oven.DoorOpen", "2:DoorOpen", "Door Open"),
                node_var(
                    "ns=2;s=Line2.Oven.TimeRemain",
                    "2:TimeRemaining",
                    "Time Remaining",
                ),
            ],
            // ═══ UTILITIES ═══
            "ns=2;s=Utilities" => vec![
                node_obj("ns=2;s=Util.Air", "2:CompressedAir", "Compressed Air"),
                node_obj("ns=2;s=Util.Power", "2:PowerMonitor", "Power Monitor"),
                node_obj("ns=2;s=Util.Water", "2:WaterSystem", "Water System"),
            ],
            // Compressed Air
            "ns=2;s=Util.Air" => vec![
                node_var(
                    "ns=2;s=Util.Air.Pressure",
                    "2:LinePressure",
                    "Line Pressure",
                ),
                node_var("ns=2;s=Util.Air.Flow", "2:FlowRate", "Flow Rate"),
                node_var(
                    "ns=2;s=Util.Air.CompTemp",
                    "2:CompressorTemp",
                    "Compressor Temperature",
                ),
                node_var(
                    "ns=2;s=Util.Air.Running",
                    "2:CompressorRunning",
                    "Compressor Running",
                ),
            ],
            // Power Monitor
            "ns=2;s=Util.Power" => vec![
                node_var("ns=2;s=Util.Power.Voltage", "2:Voltage", "Voltage"),
                node_var("ns=2;s=Util.Power.Current", "2:Current", "Current"),
                node_var(
                    "ns=2;s=Util.Power.ActivePower",
                    "2:ActivePower",
                    "Active Power",
                ),
                node_var(
                    "ns=2;s=Util.Power.PowerFactor",
                    "2:PowerFactor",
                    "Power Factor",
                ),
                node_var("ns=2;s=Util.Power.Frequency", "2:Frequency", "Frequency"),
                node_var("ns=2;s=Util.Power.Energy", "2:TotalEnergy", "Total Energy"),
            ],
            // Water System
            "ns=2;s=Util.Water" => vec![
                node_var("ns=2;s=Util.Water.Flow", "2:FlowRate", "Flow Rate"),
                node_var("ns=2;s=Util.Water.Pressure", "2:Pressure", "Pressure"),
                node_var("ns=2;s=Util.Water.Temp", "2:Temperature", "Temperature"),
                node_var("ns=2;s=Util.Water.PH", "2:PHLevel", "pH Level"),
            ],
            // ═══ QUALITY CONTROL ═══
            "ns=2;s=Quality" => vec![
                node_var("ns=2;s=Quality.PassRate", "2:PassRate", "Pass Rate"),
                node_var(
                    "ns=2;s=Quality.DefectCount",
                    "2:DefectCount",
                    "Defect Count",
                ),
                node_var("ns=2;s=Quality.BatchId", "2:CurrentBatch", "Current Batch"),
                node_var(
                    "ns=2;s=Quality.InspectionCount",
                    "2:InspectionCount",
                    "Inspection Count",
                ),
                node_var(
                    "ns=2;s=Quality.LastDefect",
                    "2:LastDefectType",
                    "Last Defect Type",
                ),
            ],
            // Types folder
            "ns=0;i=86" => vec![
                node_obj("ns=0;i=88", "0:ObjectTypes", "ObjectTypes"),
                node_obj("ns=0;i=89", "0:VariableTypes", "VariableTypes"),
                node_obj("ns=0;i=90", "0:DataTypes", "DataTypes"),
                node_obj("ns=0;i=91", "0:ReferenceTypes", "ReferenceTypes"),
            ],
            // Views folder
            "ns=0;i=87" => vec![],
            _ => vec![],
        }
    }

    /// Read details of a specific node
    pub fn read_node_details(&self, node_id: &str) -> NodeDetails {
        let now = self.now_str();
        let t = self.elapsed_secs();

        let (display_name, description, node_class, data_type, value, access) =
            self.get_node_info(node_id, t);

        let mut attributes = vec![
            attr("NodeId", node_id, "NodeId"),
            attr("NodeClass", &node_class, "Int32"),
            attr("BrowseName", &display_name, "QualifiedName"),
            attr("DisplayName", &display_name, "LocalizedText"),
            attr("Description", &description, "LocalizedText"),
        ];

        if node_class == "Variable" {
            attributes.push(attr(
                "Value",
                value.as_deref().unwrap_or("null"),
                data_type.as_deref().unwrap_or("Unknown"),
            ));
            attributes.push(attr(
                "DataType",
                data_type.as_deref().unwrap_or("Unknown"),
                "NodeId",
            ));
            attributes.push(attr("AccessLevel", &format!("{}", access), "Byte"));
            attributes.push(attr("UserAccessLevel", &format!("{}", access), "Byte"));
            attributes.push(attr("MinimumSamplingInterval", "100", "Double"));
            attributes.push(attr("Historizing", "false", "Boolean"));
            attributes.push(attr("ValueRank", "-1", "Int32"));
        }

        let references = self.get_references(node_id);

        NodeDetails {
            node_id: node_id.to_string(),
            browse_name: display_name.clone(),
            display_name: display_name.clone(),
            description,
            node_class,
            data_type,
            value,
            status_code: "Good".to_string(),
            server_timestamp: Some(now.clone()),
            source_timestamp: Some(now),
            access_level: Some(access),
            user_access_level: Some(access),
            minimum_sampling_interval: Some(100.0),
            historizing: Some(false),
            value_rank: Some(-1),
            attributes,
            references,
        }
    }

    /// Read current values of multiple nodes
    pub fn read_values(&self, node_ids: &[String]) -> Vec<ReadResult> {
        let now = self.now_str();
        let t = self.elapsed_secs();

        node_ids
            .iter()
            .map(|nid| {
                let (_, _, _, data_type, value, _) = self.get_node_info(nid, t);
                ReadResult {
                    node_id: nid.clone(),
                    value,
                    data_type,
                    status_code: "Good".to_string(),
                    server_timestamp: Some(now.clone()),
                    source_timestamp: Some(now.clone()),
                }
            })
            .collect()
    }

    /// Write a value to a node
    pub fn write_value(&self, request: &WriteRequest) -> WriteResult {
        let mut values = self.writable_values.lock();
        values.insert(request.node_id.clone(), request.value.clone());
        WriteResult {
            node_id: request.node_id.clone(),
            status_code: "Good".to_string(),
            success: true,
        }
    }

    /// Poll subscription data (read values for monitored nodes)
    pub fn poll_values(
        &self,
        sub_id: u32,
        items: &[(u32, String, String)],
    ) -> Vec<DataChangeEvent> {
        let now = self.now_str();
        let t = self.elapsed_secs();

        items
            .iter()
            .map(|(item_id, node_id, display_name)| {
                let (_, _, _, data_type, value, _) = self.get_node_info(node_id, t);
                DataChangeEvent {
                    subscription_id: sub_id,
                    monitored_item_id: *item_id,
                    node_id: node_id.clone(),
                    display_name: display_name.clone(),
                    value: value.unwrap_or_else(|| "null".to_string()),
                    data_type: data_type.unwrap_or_else(|| "Unknown".to_string()),
                    status_code: "Good".to_string(),
                    source_timestamp: Some(now.clone()),
                    server_timestamp: Some(now.clone()),
                }
            })
            .collect()
    }

    /// Generate simulated industrial events (alarms, warnings, status changes)
    pub fn generate_events(&self) -> Vec<EventData> {
        let mut rng = rand::thread_rng();
        let t = self.elapsed_secs();
        let now = self.now_str();

        // Generate 0-3 events per poll based on probabilistic triggers
        let mut events = Vec::new();

        // Event templates: (source_name, event_type, severity_range, messages, source_node_id)
        let templates: Vec<(&str, &str, (u16, u16), Vec<&str>, &str)> = vec![
            (
                "Robot Arm #1",
                "ConditionType",
                (200, 500),
                vec![
                    "Motor temperature approaching upper limit",
                    "Vibration level slightly elevated",
                    "Cycle time deviation detected",
                    "Torque spike registered during operation",
                ],
                "ns=2;s=Line1.Robot1",
            ),
            (
                "Robot Arm #2",
                "ConditionType",
                (100, 400),
                vec![
                    "Joint calibration drift detected",
                    "Motor current draw above nominal",
                    "Scheduled maintenance approaching",
                ],
                "ns=2;s=Line1.Robot2",
            ),
            (
                "Conveyor Belt",
                "AlarmConditionType",
                (300, 700),
                vec![
                    "Belt tension outside normal range",
                    "Motor overtemperature warning",
                    "Load sensor deviation",
                    "Emergency stop triggered",
                ],
                "ns=2;s=Line1.Conveyor",
            ),
            (
                "CNC Machine",
                "AlarmConditionType",
                (400, 900),
                vec![
                    "Tool wear threshold exceeded - replace tool",
                    "Spindle bearing temperature high",
                    "Coolant level low - refill required",
                    "Feed rate override active",
                    "Part program completed successfully",
                ],
                "ns=2;s=Line2.CNC",
            ),
            (
                "Hydraulic Press",
                "ConditionType",
                (200, 600),
                vec![
                    "Oil temperature above setpoint",
                    "Pressure relief valve activated",
                    "Cycle count milestone reached",
                    "Ram position sensor recalibrated",
                ],
                "ns=2;s=Line2.Press",
            ),
            (
                "Curing Oven",
                "AlarmConditionType",
                (300, 800),
                vec![
                    "Temperature deviation from setpoint >2C",
                    "Door seal integrity check warning",
                    "Humidity sensor reading out of range",
                    "Cure cycle completed - batch ready",
                ],
                "ns=2;s=Line2.Oven",
            ),
            (
                "Compressed Air",
                "ConditionType",
                (100, 500),
                vec![
                    "Line pressure drop detected",
                    "Compressor duty cycle high",
                    "Air dryer filter change due",
                ],
                "ns=2;s=Util.Air",
            ),
            (
                "Power Monitor",
                "AlarmConditionType",
                (500, 1000),
                vec![
                    "Voltage sag detected on main supply",
                    "Power factor below 0.9 threshold",
                    "Peak demand approaching contract limit",
                    "Harmonic distortion level elevated",
                ],
                "ns=2;s=Util.Power",
            ),
            (
                "Water System",
                "ConditionType",
                (100, 400),
                vec![
                    "pH level outside normal range",
                    "Flow rate below minimum threshold",
                    "Filter differential pressure high",
                ],
                "ns=2;s=Util.Water",
            ),
            (
                "Quality Control",
                "EventType",
                (200, 700),
                vec![
                    "Defect rate increase detected in last 10 samples",
                    "Surface scratch - Class B defect logged",
                    "Dimensional tolerance exceeded on part",
                    "Batch inspection passed - 100% yield",
                ],
                "ns=2;s=Quality",
            ),
        ];

        // Use time-based seeding to produce varied but not overwhelming events
        // Generate 1-3 events each poll, cycling through sources
        let cycle = (t * 0.5) as usize;
        let event_count = rng.gen_range(1..=3);

        for i in 0..event_count {
            let template_idx = (cycle + i) % templates.len();
            let (source_name, event_type, (sev_min, sev_max), messages, source_node_id) =
                &templates[template_idx];

            let msg_idx = rng.gen_range(0..messages.len());
            let severity = rng.gen_range(*sev_min..=*sev_max);
            let eid = self
                .event_counter
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

            events.push(EventData {
                event_id: format!("evt-{:06}", eid),
                source_name: source_name.to_string(),
                event_type: event_type.to_string(),
                severity,
                message: messages[msg_idx].to_string(),
                timestamp: now.clone(),
                receive_time: now.clone(),
                source_node_id: Some(source_node_id.to_string()),
            });
        }

        events
    }

    /// Get simulated info for a node: (display_name, description, node_class, data_type, value, access_level)
    fn get_node_info(
        &self,
        node_id: &str,
        t: f64,
    ) -> (String, String, String, Option<String>, Option<String>, u8) {
        // Check for user-written values first
        let written = self.writable_values.lock().get(node_id).cloned();

        use rand::Rng as _;
        let n = || rand::thread_rng().gen_range(-0.5_f64..0.5);
        let n2 = || rand::thread_rng().gen_range(-2.0_f64..2.0);

        match node_id {
            // ─── Server ─────────────────────────────────────
            "ns=0;i=2257" => ("StartTime".into(), "Server start time".into(), "Variable".into(), Some("DateTime".into()), Some(self.start_time.format("%Y-%m-%dT%H:%M:%SZ").to_string()), 1),
            "ns=0;i=2258" => ("CurrentTime".into(), "Current server time".into(), "Variable".into(), Some("DateTime".into()), Some(self.now_str()), 1),
            "ns=0;i=2259" => ("State".into(), "Server state: 0=Running".into(), "Variable".into(), Some("Int32".into()), Some("0".into()), 1),
            "ns=0;i=2267" => ("ServiceLevel".into(), "Server service level".into(), "Variable".into(), Some("Byte".into()), Some("255".into()), 1),
            "ns=0;i=2994" => ("Auditing".into(), "Server auditing enabled".into(), "Variable".into(), Some("Boolean".into()), Some("true".into()), 1),
            "ns=0;i=2254" => ("ServerArray".into(), "".into(), "Variable".into(), Some("String".into()), Some("urn:IoTUI:SimulatedServer".into()), 1),
            "ns=0;i=2255" => ("NamespaceArray".into(), "".into(), "Variable".into(), Some("String".into()), Some("[\"http://opcfoundation.org/UA/\", \"urn:IoTUI:SimulatedServer\", \"urn:IoTUI:Plant\"]".into()), 1),

            // ─── Line 1 status ──────────────────────────────
            "ns=2;s=Line1.Status" => ("Line Status".into(), "Production line 1 operating status".into(), "Variable".into(), Some("String".into()), written.map(|v| v).or(Some("Running".into())), 3),
            "ns=2;s=Line1.ProductCount" => ("Product Count".into(), "Total products on line 1".into(), "Variable".into(), Some("UInt32".into()), Some(format!("{}", 8940 + (t / 12.0) as u64)), 1),
            "ns=2;s=Line1.OEE" => ("OEE".into(), "Overall Equipment Effectiveness".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 87.3 + (t * 0.01).sin() * 2.0 + n())), 1),
            "ns=2;s=Line1.CycleTime" => ("Cycle Time".into(), "Average cycle time (seconds)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 4.82 + (t * 0.05).sin() * 0.3 + n() * 0.1)), 1),

            // ─── Robot 1 ────────────────────────────────────
            "ns=2;s=Line1.Robot1.Temp" => ("Temperature".into(), "Robot arm motor temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 78.2 + (t * 0.02).sin() * 4.0 + n())), 1),
            "ns=2;s=Line1.Robot1.Speed" => ("Motor Speed".into(), "Motor speed (RPM)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 1568.0 + (t * 0.03).sin() * 50.0 + n2())), 1),
            "ns=2;s=Line1.Robot1.Torque" => ("Torque".into(), "Current torque (Nm)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 42.5 + (t * 0.04).sin() * 8.0 + n())), 1),
            "ns=2;s=Line1.Robot1.Position" => ("Joint Position".into(), "Current joint angle (degrees)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 145.0 + (t * 0.1).sin() * 30.0)), 3),
            "ns=2;s=Line1.Robot1.Current" => ("Motor Current".into(), "Motor current draw (A)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 12.4 + (t * 0.03).sin() * 2.0 + n() * 0.3)), 1),
            "ns=2;s=Line1.Robot1.Vibration" => ("Vibration".into(), "Vibration level (mm/s)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.3}", 0.82 + (t * 0.05).sin() * 0.2 + n() * 0.05)), 1),
            "ns=2;s=Line1.Robot1.Status" => ("Operating Status".into(), "0=Idle, 1=Running, 2=Error".into(), "Variable".into(), Some("Int32".into()), written.map(|v| v).or(Some("1".into())), 3),
            "ns=2;s=Line1.Robot1.Hours" => ("Operating Hours".into(), "Total operating hours".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 12847.3 + t / 3600.0)), 1),
            "ns=2;s=Line1.Robot1.Errors" => ("Error Count".into(), "Total error count".into(), "Variable".into(), Some("UInt32".into()), Some("3".into()), 1),

            // ─── Robot 2 ────────────────────────────────────
            "ns=2;s=Line1.Robot2.Temp" => ("Temperature".into(), "Robot arm motor temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 72.6 + (t * 0.025).sin() * 3.5 + n())), 1),
            "ns=2;s=Line1.Robot2.Speed" => ("Motor Speed".into(), "Motor speed (RPM)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 1420.0 + (t * 0.035).sin() * 45.0 + n2())), 1),
            "ns=2;s=Line1.Robot2.Torque" => ("Torque".into(), "Current torque (Nm)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 38.2 + (t * 0.045).sin() * 6.0 + n())), 1),
            "ns=2;s=Line1.Robot2.Position" => ("Joint Position".into(), "Current joint angle (degrees)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 90.0 + (t * 0.08).sin() * 45.0)), 3),
            "ns=2;s=Line1.Robot2.Current" => ("Motor Current".into(), "Motor current draw (A)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 10.8 + (t * 0.025).sin() * 1.5 + n() * 0.2)), 1),
            "ns=2;s=Line1.Robot2.Vibration" => ("Vibration".into(), "Vibration level (mm/s)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.3}", 0.65 + (t * 0.06).sin() * 0.15 + n() * 0.03)), 1),
            "ns=2;s=Line1.Robot2.Status" => ("Operating Status".into(), "0=Idle, 1=Running, 2=Error".into(), "Variable".into(), Some("Int32".into()), written.map(|v| v).or(Some("1".into())), 3),
            "ns=2;s=Line1.Robot2.Hours" => ("Operating Hours".into(), "Total operating hours".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 9234.7 + t / 3600.0)), 1),
            "ns=2;s=Line1.Robot2.Errors" => ("Error Count".into(), "Total error count".into(), "Variable".into(), Some("UInt32".into()), Some("11".into()), 1),

            // ─── Conveyor ───────────────────────────────────
            "ns=2;s=Line1.Conveyor.Speed" => ("Belt Speed".into(), "Belt speed (m/min)".into(), "Variable".into(), Some("Double".into()), written.map(|v| v).or(Some(format!("{:.1}", 2.4 + (t * 0.01).sin() * 0.2 + n() * 0.05))), 3),
            "ns=2;s=Line1.Conveyor.Load" => ("Current Load".into(), "Belt load (kg)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 145.0 + (t * 0.02).sin() * 20.0 + n2())), 1),
            "ns=2;s=Line1.Conveyor.Temp" => ("Motor Temperature".into(), "Conveyor motor temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 55.3 + (t * 0.01).sin() * 3.0 + n())), 1),
            "ns=2;s=Line1.Conveyor.Running" => ("Is Running".into(), "Conveyor running state".into(), "Variable".into(), Some("Boolean".into()), written.map(|v| v).or(Some("true".into())), 3),
            "ns=2;s=Line1.Conveyor.TotalDist" => ("Total Distance".into(), "Total belt travel (km)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 48723.4 + t * 0.04)), 1),

            // ─── PLC ────────────────────────────────────────
            "ns=2;s=Line1.PLC.CpuLoad" => ("CPU Load".into(), "PLC CPU utilization (%)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 34.0 + (t * 0.07).sin() * 15.0 + n2())), 1),
            "ns=2;s=Line1.PLC.MemUsage" => ("Memory Usage".into(), "PLC memory utilization (%)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 62.0 + (t * 0.005).sin() * 3.0)), 1),
            "ns=2;s=Line1.PLC.CycleTime" => ("Scan Cycle Time".into(), "PLC scan cycle time (ms)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 8.4 + (t * 0.1).sin() * 1.0 + n() * 0.2)), 1),
            "ns=2;s=Line1.PLC.IoStatus" => ("I/O Status".into(), "I/O module status: OK".into(), "Variable".into(), Some("String".into()), Some("OK".into()), 1),
            "ns=2;s=Line1.PLC.FwVersion" => ("Firmware Version".into(), "PLC firmware version".into(), "Variable".into(), Some("String".into()), Some("v3.2.1-build.847".into()), 1),
            "ns=2;s=Line1.PLC.Uptime" => ("Uptime".into(), "PLC uptime (hours)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 2184.0 + t / 3600.0)), 1),

            // ─── Line 2 ─────────────────────────────────────
            "ns=2;s=Line2.Status" => ("Line Status".into(), "Production line 2 status".into(), "Variable".into(), Some("String".into()), Some("Running".into()), 3),
            "ns=2;s=Line2.ProductCount" => ("Product Count".into(), "Products on line 2".into(), "Variable".into(), Some("UInt32".into()), Some(format!("{}", 5230 + (t / 18.0) as u64)), 1),

            // CNC Machine
            "ns=2;s=Line2.CNC.SpindleSpeed" => ("Spindle Speed".into(), "Spindle rotation speed (RPM)".into(), "Variable".into(), Some("Double".into()), written.map(|v| v).or(Some(format!("{:.0}", 8944.0 + (t * 0.02).sin() * 200.0 + n2() * 5.0))), 3),
            "ns=2;s=Line2.CNC.FeedRate" => ("Feed Rate".into(), "Feed rate (mm/min)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 450.0 + (t * 0.03).sin() * 30.0)), 1),
            "ns=2;s=Line2.CNC.SpindleTemp" => ("Spindle Temperature".into(), "Spindle bearing temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 48.7 + (t * 0.01).sin() * 5.0 + n())), 1),
            "ns=2;s=Line2.CNC.CoolantTemp" => ("Coolant Temperature".into(), "Coolant temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 22.3 + (t * 0.008).sin() * 2.0 + n() * 0.3)), 1),
            "ns=2;s=Line2.CNC.CoolantLevel" => ("Coolant Level".into(), "Coolant level (%)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 78.0 - (t * 0.001).sin().abs() * 5.0)), 1),
            "ns=2;s=Line2.CNC.ToolWear" => ("Tool Wear".into(), "Tool wear percentage".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", (23.0 + t * 0.01) % 100.0)), 1),
            "ns=2;s=Line2.CNC.PartProgram" => ("Active Program".into(), "Currently running part program".into(), "Variable".into(), Some("String".into()), Some("O1247-BRACKET-R3".into()), 1),
            "ns=2;s=Line2.CNC.PartsComplete" => ("Parts Complete".into(), "Parts completed this batch".into(), "Variable".into(), Some("UInt32".into()), Some(format!("{}", 127 + (t / 45.0) as u64)), 1),
            "ns=2;s=Line2.CNC.Alarm" => ("Alarm Active".into(), "CNC alarm status".into(), "Variable".into(), Some("Boolean".into()), Some("false".into()), 1),

            // Hydraulic Press
            "ns=2;s=Line2.Press.Pressure" => ("Pressure".into(), "Hydraulic pressure (bar)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 185.0 + (t * 0.15).sin() * 80.0 + n2())), 1),
            "ns=2;s=Line2.Press.Force" => ("Applied Force".into(), "Press force (kN)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 450.0 + (t * 0.15).sin() * 200.0)), 1),
            "ns=2;s=Line2.Press.OilTemp" => ("Oil Temperature".into(), "Hydraulic oil temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 45.0 + (t * 0.005).sin() * 3.0 + n())), 1),
            "ns=2;s=Line2.Press.OilLevel" => ("Oil Level".into(), "Oil level (%)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 92.0 + n())), 1),
            "ns=2;s=Line2.Press.CycleCount" => ("Cycle Count".into(), "Total press cycles".into(), "Variable".into(), Some("UInt64".into()), Some(format!("{}", 284729 + (t / 8.0) as u64)), 1),
            "ns=2;s=Line2.Press.Position" => ("Ram Position".into(), "Ram position (mm)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 50.0 + (t * 0.15).sin().abs() * 150.0)), 1),

            // Curing Oven
            "ns=2;s=Line2.Oven.Temp" => ("Temperature".into(), "Oven temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 178.5 + (t * 0.003).sin() * 2.0 + n() * 0.5)), 1),
            "ns=2;s=Line2.Oven.SetPoint" => ("Set Point".into(), "Temperature set point (C)".into(), "Variable".into(), Some("Double".into()), written.map(|v| v).or(Some("180.0".into())), 3),
            "ns=2;s=Line2.Oven.Humidity" => ("Humidity".into(), "Oven humidity (%)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 12.0 + (t * 0.01).sin() * 3.0 + n() * 0.5)), 1),
            "ns=2;s=Line2.Oven.FanSpeed" => ("Fan Speed".into(), "Circulation fan speed (RPM)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 1200.0 + n2() * 10.0)), 1),
            "ns=2;s=Line2.Oven.DoorOpen" => ("Door Open".into(), "Oven door state".into(), "Variable".into(), Some("Boolean".into()), Some("false".into()), 1),
            "ns=2;s=Line2.Oven.TimeRemain" => ("Time Remaining".into(), "Cure time remaining (min)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", (42.0 - (t % 2520.0) / 60.0).max(0.0))), 1),

            // ─── Utilities ──────────────────────────────────
            "ns=2;s=Util.Air.Pressure" => ("Line Pressure".into(), "Compressed air line pressure (bar)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 6.8 + (t * 0.02).sin() * 0.3 + n() * 0.1)), 1),
            "ns=2;s=Util.Air.Flow" => ("Flow Rate".into(), "Air flow rate (L/min)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 320.0 + (t * 0.03).sin() * 40.0 + n2() * 5.0)), 1),
            "ns=2;s=Util.Air.CompTemp" => ("Compressor Temperature".into(), "Compressor temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 62.0 + (t * 0.01).sin() * 5.0 + n())), 1),
            "ns=2;s=Util.Air.Running" => ("Compressor Running".into(), "Compressor on/off".into(), "Variable".into(), Some("Boolean".into()), Some("true".into()), 1),

            "ns=2;s=Util.Power.Voltage" => ("Voltage".into(), "Main supply voltage (V)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 398.0 + (t * 0.05).sin() * 4.0 + n())), 1),
            "ns=2;s=Util.Power.Current" => ("Current".into(), "Total current draw (A)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 245.0 + (t * 0.02).sin() * 30.0 + n2())), 1),
            "ns=2;s=Util.Power.ActivePower" => ("Active Power".into(), "Total active power (kW)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 168.0 + (t * 0.02).sin() * 20.0 + n2())), 1),
            "ns=2;s=Util.Power.PowerFactor" => ("Power Factor".into(), "Power factor".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.3}", 0.92 + (t * 0.01).sin() * 0.03)), 1),
            "ns=2;s=Util.Power.Frequency" => ("Frequency".into(), "Supply frequency (Hz)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 50.0 + n() * 0.02)), 1),
            "ns=2;s=Util.Power.Energy" => ("Total Energy".into(), "Cumulative energy (kWh)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.0}", 1284730.0 + t * 0.047)), 1),

            "ns=2;s=Util.Water.Flow" => ("Flow Rate".into(), "Water flow rate (L/min)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 45.0 + (t * 0.01).sin() * 8.0 + n())), 1),
            "ns=2;s=Util.Water.Pressure" => ("Pressure".into(), "Water pressure (bar)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 3.2 + (t * 0.008).sin() * 0.2 + n() * 0.05)), 1),
            "ns=2;s=Util.Water.Temp" => ("Temperature".into(), "Water temperature (C)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 18.5 + (t * 0.005).sin() * 1.5 + n() * 0.3)), 1),
            "ns=2;s=Util.Water.PH" => ("pH Level".into(), "Water pH level".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.2}", 7.1 + (t * 0.002).sin() * 0.3 + n() * 0.05)), 1),

            // ─── Quality ────────────────────────────────────
            "ns=2;s=Quality.PassRate" => ("Pass Rate".into(), "Quality pass rate (%)".into(), "Variable".into(), Some("Double".into()), Some(format!("{:.1}", 97.8 + (t * 0.003).sin() * 1.0 + n() * 0.2)), 1),
            "ns=2;s=Quality.DefectCount" => ("Defect Count".into(), "Total defects today".into(), "Variable".into(), Some("UInt32".into()), Some(format!("{}", 7 + (t / 300.0) as u64)), 1),
            "ns=2;s=Quality.BatchId" => ("Current Batch".into(), "Current production batch".into(), "Variable".into(), Some("String".into()), Some("BT-2026-0305-047".into()), 1),
            "ns=2;s=Quality.InspectionCount" => ("Inspection Count".into(), "Inspections performed today".into(), "Variable".into(), Some("UInt32".into()), Some(format!("{}", 342 + (t / 20.0) as u64)), 1),
            "ns=2;s=Quality.LastDefect" => ("Last Defect Type".into(), "Most recent defect classification".into(), "Variable".into(), Some("String".into()), Some("Surface Scratch - Class B".into()), 1),

            // ─── Object/folder nodes ────────────────────────
            "ns=2;s=Plant" => ("Plant".into(), "Plant root object".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line1" => ("Production Line 1".into(), "Production line 1".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line2" => ("Production Line 2".into(), "Production line 2".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line1.Robot1" => ("Robot Arm #1".into(), "Industrial robot arm unit 1".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line1.Robot2" => ("Robot Arm #2".into(), "Industrial robot arm unit 2".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line1.Conveyor" => ("Conveyor Belt".into(), "Main conveyor system".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line1.PLC" => ("PLC Controller".into(), "Programmable Logic Controller".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line2.CNC" => ("CNC Machine".into(), "CNC milling machine".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line2.Press" => ("Hydraulic Press".into(), "Hydraulic press unit".into(), "Object".into(), None, None, 0),
            "ns=2;s=Line2.Oven" => ("Curing Oven".into(), "Industrial curing oven".into(), "Object".into(), None, None, 0),
            "ns=2;s=Utilities" => ("Utilities".into(), "Plant utility systems".into(), "Object".into(), None, None, 0),
            "ns=2;s=Util.Air" => ("Compressed Air".into(), "Compressed air system".into(), "Object".into(), None, None, 0),
            "ns=2;s=Util.Power" => ("Power Monitor".into(), "Electrical power monitoring".into(), "Object".into(), None, None, 0),
            "ns=2;s=Util.Water" => ("Water System".into(), "Water supply system".into(), "Object".into(), None, None, 0),
            "ns=2;s=Quality" => ("Quality Control".into(), "Quality control system".into(), "Object".into(), None, None, 0),

            // Method nodes
            n if n.contains("Reset") || n.contains("Calibrate") || n.contains("Start") || n.contains("Stop") || n.contains("SetSpeed") => {
                let name = n.rsplit('.').next().unwrap_or(n);
                (name.into(), format!("{} method", name), "Method".into(), None, None, 0)
            }

            _ => ("Unknown".into(), "".into(), "Variable".into(), Some("String".into()), Some("N/A".into()), 0),
        }
    }

    fn get_references(&self, node_id: &str) -> Vec<ReferenceInfo> {
        // Return some basic references for the node
        let children = self.browse(node_id);
        children
            .iter()
            .map(|c| ReferenceInfo {
                reference_type: "HasComponent".to_string(),
                is_forward: true,
                target_node_id: c.node_id.clone(),
                target_browse_name: c.browse_name.clone(),
                target_display_name: c.display_name.clone(),
                target_node_class: c.node_class.clone(),
            })
            .collect()
    }

    /// Get method argument metadata for simulator methods
    pub fn get_method_info(&self, method_node_id: &str) -> Result<MethodInfo, String> {
        match method_node_id {
            "ns=2;s=Line1.Robot1.Reset" => Ok(MethodInfo {
                node_id: method_node_id.to_string(),
                browse_name: "2:Reset".to_string(),
                display_name: "Reset".to_string(),
                description: "Reset the robot arm to its home position and clear error state"
                    .to_string(),
                input_arguments: vec![],
                output_arguments: vec![MethodArgument {
                    name: "Result".to_string(),
                    data_type: "String".to_string(),
                    description: "Reset result message".to_string(),
                }],
            }),
            "ns=2;s=Line1.Robot1.Calibrate" => Ok(MethodInfo {
                node_id: method_node_id.to_string(),
                browse_name: "2:Calibrate".to_string(),
                display_name: "Calibrate".to_string(),
                description: "Run calibration sequence on the robot arm".to_string(),
                input_arguments: vec![MethodArgument {
                    name: "Axis".to_string(),
                    data_type: "String".to_string(),
                    description: "Axis to calibrate (X, Y, Z, or All)".to_string(),
                }],
                output_arguments: vec![MethodArgument {
                    name: "CalibrationOffset".to_string(),
                    data_type: "Double".to_string(),
                    description: "Measured calibration offset".to_string(),
                }],
            }),
            "ns=2;s=Line1.Robot2.Reset" => Ok(MethodInfo {
                node_id: method_node_id.to_string(),
                browse_name: "2:Reset".to_string(),
                display_name: "Reset".to_string(),
                description: "Reset robot arm #2 to home position".to_string(),
                input_arguments: vec![],
                output_arguments: vec![MethodArgument {
                    name: "Result".to_string(),
                    data_type: "String".to_string(),
                    description: "Reset result message".to_string(),
                }],
            }),
            "ns=2;s=Line1.Conveyor.Start" => Ok(MethodInfo {
                node_id: method_node_id.to_string(),
                browse_name: "2:Start".to_string(),
                display_name: "Start".to_string(),
                description: "Start the conveyor belt".to_string(),
                input_arguments: vec![],
                output_arguments: vec![MethodArgument {
                    name: "Result".to_string(),
                    data_type: "String".to_string(),
                    description: "Operation result".to_string(),
                }],
            }),
            "ns=2;s=Line1.Conveyor.Stop" => Ok(MethodInfo {
                node_id: method_node_id.to_string(),
                browse_name: "2:Stop".to_string(),
                display_name: "Stop".to_string(),
                description: "Stop the conveyor belt".to_string(),
                input_arguments: vec![MethodArgument {
                    name: "Emergency".to_string(),
                    data_type: "Boolean".to_string(),
                    description: "If true, perform emergency stop (immediate halt)".to_string(),
                }],
                output_arguments: vec![MethodArgument {
                    name: "Result".to_string(),
                    data_type: "String".to_string(),
                    description: "Operation result".to_string(),
                }],
            }),
            "ns=2;s=Line1.Conveyor.SetSpeed" => Ok(MethodInfo {
                node_id: method_node_id.to_string(),
                browse_name: "2:SetSpeed".to_string(),
                display_name: "Set Speed".to_string(),
                description: "Set the conveyor belt speed".to_string(),
                input_arguments: vec![
                    MethodArgument {
                        name: "Speed".to_string(),
                        data_type: "Double".to_string(),
                        description: "Target speed in meters per minute (0.1 - 10.0)".to_string(),
                    },
                    MethodArgument {
                        name: "RampTime".to_string(),
                        data_type: "UInt32".to_string(),
                        description: "Time in milliseconds to reach target speed".to_string(),
                    },
                ],
                output_arguments: vec![
                    MethodArgument {
                        name: "ActualSpeed".to_string(),
                        data_type: "Double".to_string(),
                        description: "Achieved speed after ramp".to_string(),
                    },
                    MethodArgument {
                        name: "Result".to_string(),
                        data_type: "String".to_string(),
                        description: "Operation result".to_string(),
                    },
                ],
            }),
            _ => Err(format!("Method not found: {method_node_id}")),
        }
    }

    /// Execute a simulated method call with realistic results
    pub fn call_method(&self, request: &CallMethodRequest) -> Result<CallMethodResult, String> {
        let method = &request.method_node_id;
        match method.as_str() {
            n if n.ends_with(".Reset") => Ok(CallMethodResult {
                status_code: "Good".to_string(),
                output_arguments: vec!["Reset completed successfully".to_string()],
            }),
            n if n.ends_with(".Calibrate") => {
                let axis = request
                    .input_arguments
                    .first()
                    .map(|a| a.value.as_str())
                    .unwrap_or("All");
                let offset: f64 = rand::thread_rng().gen_range(-0.05..0.05);
                Ok(CallMethodResult {
                    status_code: "Good".to_string(),
                    output_arguments: vec![format!("{offset:.4}")],
                })
            }
            n if n.ends_with(".Start") => Ok(CallMethodResult {
                status_code: "Good".to_string(),
                output_arguments: vec!["Conveyor started".to_string()],
            }),
            n if n.ends_with(".Stop") => {
                let emergency = request
                    .input_arguments
                    .first()
                    .map(|a| a.value == "true")
                    .unwrap_or(false);
                let msg = if emergency {
                    "Emergency stop executed"
                } else {
                    "Conveyor stopped"
                };
                Ok(CallMethodResult {
                    status_code: "Good".to_string(),
                    output_arguments: vec![msg.to_string()],
                })
            }
            n if n.ends_with(".SetSpeed") => {
                let speed: f64 = request
                    .input_arguments
                    .first()
                    .and_then(|a| a.value.parse().ok())
                    .unwrap_or(1.0);
                let clamped = speed.clamp(0.1, 10.0);
                Ok(CallMethodResult {
                    status_code: "Good".to_string(),
                    output_arguments: vec![
                        format!("{clamped:.2}"),
                        format!("Speed set to {clamped:.2} m/min"),
                    ],
                })
            }
            _ => Err(format!("Unknown method: {method}")),
        }
    }
}

fn node_obj(id: &str, browse: &str, display: &str) -> BrowseNode {
    BrowseNode {
        node_id: id.to_string(),
        browse_name: browse.to_string(),
        display_name: display.to_string(),
        node_class: "Object".to_string(),
        has_children: true,
        type_definition: Some("i=58".to_string()),
    }
}

fn node_var(id: &str, browse: &str, display: &str) -> BrowseNode {
    BrowseNode {
        node_id: id.to_string(),
        browse_name: browse.to_string(),
        display_name: display.to_string(),
        node_class: "Variable".to_string(),
        has_children: false,
        type_definition: Some("i=63".to_string()),
    }
}

fn node_method(id: &str, browse: &str, display: &str) -> BrowseNode {
    BrowseNode {
        node_id: id.to_string(),
        browse_name: browse.to_string(),
        display_name: display.to_string(),
        node_class: "Method".to_string(),
        has_children: false,
        type_definition: None,
    }
}

fn attr(name: &str, value: &str, dt: &str) -> NodeAttribute {
    NodeAttribute {
        name: name.to_string(),
        value: value.to_string(),
        data_type: Some(dt.to_string()),
        status: "Good".to_string(),
    }
}

impl Default for OpcUaSimulator {
    fn default() -> Self {
        Self::new()
    }
}
