const { Rcon } = require('rcon-client');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Ruta al archivo de logs de Minecraft
const logPath = 'C:/Users/Shaw/Desktop/Server/logs/latest.log';

// Configura el servidor WebSocket
const wss = new WebSocket.Server({ port: 8080 });
// Mapa para almacenar los watchers de fs
const watchers = new Map();
const filePositionsLog = new Map();

console.log(`Observando el archivo de logs en: ${logPath}`); // Imprimir la ruta del log

// Configura la conexión RCON
async function connectRCON(ws, message) {
  let rcon; // Variable para almacenar la conexión RCON
  try {
    rcon = new Rcon({
      host: 'localhost',  // IP o dominio del servidor Minecraft
      port: 25575,        // Puerto RCON
      password: message,  // Contraseña RCON
    });

    await rcon.connect();
    console.log('Conectado a RCON');
    ws.send('Logged'); // Notificar al cliente que se ha conectado a RCON


    // Manejar los mensajes de RCON
    rcon.on('response', (response) => {
      // Transmitir el mensaje recibido de RCON a todos los clientes conectados
      ws.send(`RCON Response: ${response}`);
    });
    // Mostrar logs anteriores al nuevo cliente
    await mostrarLogsAnteriores(ws);

    return rcon;
  } catch (err) {
    console.error('Error al conectar a RCON:', err);
    ws.send('Not logged');
    return null;

  }
}

// Función para leer nuevos datos del archivo de logs
function leerNuevosLogs(ws) {
  fs.readFile(logPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer el archivo de logs:', err);
      return;
    }
    const filePosition = filePositionsLog.get(ws); // Obtener la última posición del archivo de logs
    // Obtener las nuevas líneas desde la última posición
    const nuevasLineas = data.slice(filePosition).split('\n').filter(Boolean);
    console.log(`Nuevas líneas detectadas: ${nuevasLineas.length}`); // Debugging: cuántas nuevas líneas se han detectado
    if (nuevasLineas.length > 0) {
      // Enviar las nuevas líneas al cliente
      ws.send(`\n${nuevasLineas.join('\n')}\n`);


      // Actualizar la posición
      filePositionsLog.set(ws, data.length);
    }
  });
}


// Función para leer los logs iniciales y mostrarlos al cliente
async function mostrarLogsAnteriores(ws) {
  return await fs.readFile(logPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer el archivo de logs:', err);
      ws.send('Error al leer los logs.'); // Notifica al cliente si hubo un error
    } else {
      ws.send(`\n${data}\n`);
      filePositionsLog.set(ws, data.length); // Actualizar la posición del archivo de logs
    }
  });
}



// Manejo de WebSocket
wss.on('connection', (ws) => {
  filePositionsLog.set(ws, 0); // Inicializar la posición del archivo de logs
  let monitorizing = false; // Variable para saber si se está monitorizando el archivo de logs
  console.log('Cliente WebSocket conectado');
  let rcon = null; // Conexión RCON
  ws.send('Conectando a RCON...'); // Notificar al cliente que se está conectando a RCON

  // Escuchar comandos desde la interfaz web
  ws.on('message', async (message) => {

    // Enviar el comando al servidor RCON
    if (rcon !== null) {
      if (!monitorizing) {

        // Iniciar fs.watchFile cuando se establece la conexión WebSocket
        const watcher = fs.watchFile(logPath, (curr, prev) => {
          leerNuevosLogs(ws);
        });
        watchers.set(ws, watcher); // Almacenar el watcher en el mapa
        monitorizing = true;
      }
      console.log(`Mensaje recibido del cliente: ${message}`);
      try {
        const response = await rcon.send(message);
        ws.send(`Comando ejecutado: ${message}, Respuesta:\n${response}`);
      } catch (err) {
        ws.send(`Error al ejecutar el comando: ${err.message}`);
      }
    } else {
      // Conectar a RCON
      rcon = await connectRCON(ws, message);
    }
  });

  ws.on('close', () => {
    console.log('Cliente WebSocket desconectado');
    if (rcon !== null) {
      rcon.end();
    }
    const watcher = watchers.get(ws);
    if (watcher) {
      fs.unwatchFile(logPath, watcher);
      watchers.delete(ws); // Eliminar el watcher del mapa
    }
    const filePosition = filePositionsLog.get(ws);
    if (filePosition) {
      filePositionsLog.delete(ws); // Eliminar la posición del archivo
    }
  });
});
