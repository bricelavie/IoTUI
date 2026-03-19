use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("OPC UA error: {0}")]
    OpcUa(String),

    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Security error: {0}")]
    Security(String),

    #[error("MQTT error: {0}")]
    Mqtt(String),

    #[error("Modbus error: {0}")]
    Modbus(String),
}

impl AppError {
    pub fn opcua(message: impl Into<String>) -> Self {
        Self::OpcUa(message.into())
    }

    pub fn connection(message: impl Into<String>) -> Self {
        Self::Connection(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::InvalidArgument(message.into())
    }

    pub fn security(message: impl Into<String>) -> Self {
        Self::Security(message.into())
    }

    pub fn mqtt(message: impl Into<String>) -> Self {
        Self::Mqtt(message.into())
    }

    pub fn modbus(message: impl Into<String>) -> Self {
        Self::Modbus(message.into())
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::OpcUa(_) => "OpcUa",
            Self::Connection(_) => "Connection",
            Self::NotFound(_) => "NotFound",
            Self::InvalidArgument(_) => "InvalidArgument",
            Self::Security(_) => "Security",
            Self::Mqtt(_) => "Mqtt",
            Self::Modbus(_) => "Modbus",
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::OpcUa(m)
            | Self::Connection(m)
            | Self::NotFound(m)
            | Self::InvalidArgument(m)
            | Self::Security(m)
            | Self::Mqtt(m)
            | Self::Modbus(m) => m,
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", self.message())?;
        s.end()
    }
}
