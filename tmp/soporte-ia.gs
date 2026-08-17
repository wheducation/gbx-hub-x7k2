/**
 * SOPORTE AUTOMATICO CON IA — The Game Box + Curso CapCut
 * ========================================================
 * Lee el buzon de soporte cada 5 minutos, averigua QUE compro la persona
 * buscandola directamente en Stripe (las dos cuentas), y responde con GPT.
 *
 * Por que Stripe y no una hoja de calculo:
 *  - Es la fuente real. Si pago, esta ahi. No depende de que un script haya
 *    alcanzado a anotar la fila.
 *  - Cubre TODO el historial de los dos negocios desde el primer dia.
 *  - No hay que mantener ningun ID de hoja.
 *
 * Reglas duras (van en el prompt, pero ademas se validan en codigo):
 *  - NUNCA promete reembolsos, devoluciones ni nada de plata -> escala.
 *  - NUNCA inventa enlaces: solo los de la zona que le corresponde.
 *  - Si el cliente esta molesto o amenaza, escala.
 *  - Si el pago aparece reembolsado o en disputa, escala.
 *  - Si no encuentra la compra, pide el correo con el que pago.
 *
 * Escalar = etiquetar, destacar y avisarle a Esteban. NO responde.
 *
 * INSTALACION: ver INSTRUCCIONES-soporte-ia.md
 */

// ============ CONFIGURACION ============

var MODELO   = 'gpt-4o-mini';        // barato y suficiente para soporte
var AVISAR_A = '';                   // tu correo para los escalados. Vacio = el del buzon.

var MAX_POR_CORRIDA = 8;             // correos por ejecucion (evita timeouts)
var ETIQUETA_OK     = 'IA-respondido';
var ETIQUETA_HUMANO = 'Revisar-Esteban';

// Firma y remitente segun el negocio del que venga el correo.
var MARCAS = {
  'Game Box': {
    firma: 'Equipo The Game Box',
    alias: 'thegamebox.console@gmail.com',   // debe estar como "Enviar como" verificado
    sitio: 'the-gamebox.com'
  },
  'Curso CapCut': {
    firma: 'Soporte Curso CapCut PRO',
    alias: 'acceso.edicionpro@gmail.com',
    sitio: 'edicion-pro.com'
  }
};
var MARCA_POR_DEFECTO = 'Curso CapCut';

// Remitentes que NUNCA se responden (automaticos)
var IGNORAR = [
  'noreply', 'no-reply', 'notifications', 'stripe.com', 'google.com',
  'mailer-daemon', 'postmaster', 'facebookmail', 'automated', 'mediafire'
];

// ============ ZONAS DE ACCESO ============

var ZONAS_CAPCUT = {
  'k2f7': 'https://edicion-pro.com/k2f7/',
  'm8d3': 'https://edicion-pro.com/m8d3/',
  'r5t9': 'https://edicion-pro.com/r5t9/',
  'v4k9': 'https://edicion-pro.com/v4k9/'
};

var ZONAS_GAMEBOX = {
  'r7m2': 'https://the-gamebox.github.io/the-game-box/r7m2/',
  'k9w4': 'https://the-gamebox.github.io/the-game-box/k9w4/',
  'p3z8': 'https://the-gamebox.github.io/the-game-box/p3z8/',
  'u6q1': 'https://the-gamebox.github.io/the-game-box/u6q1/',
  'm7x2': 'https://the-gamebox.github.io/the-game-box/m7x2/',
  'g4t9': 'https://the-gamebox.github.io/the-game-box/g4t9/'
};

// Cuentas de Stripe donde se busca al cliente. La clave secreta de cada una
// se guarda en Propiedades del script, nunca aca.
var CUENTAS = [
  { marca: 'Game Box',     prop: 'STRIPE_GAMEBOX' },
  { marca: 'Curso CapCut', prop: 'STRIPE_CAPCUT'  }
];

// ============ BASE DE CONOCIMIENTO ============
// Todo lo que la IA puede decir sale de aqui. Si algo no esta, escala.

var CONOCIMIENTO = [
  '## PRODUCTOS',
  '',
  '### Curso Editor CapCut PRO (sitio: edicion-pro.com)',
  'Curso de edicion de video en CapCut. Pago unico, acceso de por vida, todo descargable.',
  'Combos y su zona de acceso:',
  '- Curso base: zona k2f7. Curso de 0 a Experto (72 clases, ruta PC y ruta celular) + 4 PDFs de apoyo + instrucciones de la app.',
  '- Curso + Pack 87 Efectos: zona m8d3. Lo anterior mas el pack de 87 efectos virales.',
  '- Curso + Viral Cinematics: zona r5t9. Lo anterior mas el bono de 32 clases de filmmaking, algoritmo y monetizacion.',
  '- TODO INCLUIDO: zona v4k9. Las 192 clases completas.',
  'El contenido esta en carpetas de Google Drive enlazadas desde la zona de acceso.',
  '',
  '### The Game Box (sitio: the-gamebox.com)',
  'Paquetes de emulacion retro para PC y Android. Pago unico, descarga directa.',
  'Zonas segun lo que compro:',
  '- r7m2: Multiconsola Ultimate Retro (PC).',
  '- k9w4: Multiconsola + Ultimate Leyenda.',
  '- p3z8: Multiconsola + Pack Supremo Mobile.',
  '- u6q1: Multiconsola + Ultimate Leyenda + Pack Supremo Mobile.',
  '- m7x2: Pack Supremo Mobile.',
  '- g4t9: Pack Supremo Mobile + Ultimate Leyenda.',
  'La multiconsola pesa cerca de 17 GB y se baja de MediaFire. Tambien hay version LITE y BASE en Drive para computadores de gama media y baja.',
  '',
  '## PROBLEMAS FRECUENTES Y SU SOLUCION',
  '',
  '1) "No me llego el acceso" -> Si la compra aparece en Stripe, se le reenvia el enlace de SU zona.',
  '   Pedirle ademas que revise SPAM y la pestana Promociones.',
  '',
  '2) "El video no se reproduce" o "se traba" -> En Google Drive hay que DESCARGAR el video antes de verlo,',
  '   con el boton de descarga de arriba a la derecha. Son clases largas y en linea no siempre reproducen bien.',
  '',
  '3) "No me abre en el celular" -> Los archivos grandes a veces no cargan en el telefono. Abrirlo en el computador.',
  '',
  '4) "Drive me pide acceso" -> Las carpetas son publicas por enlace. Suele pasar cuando el navegador esta abierto',
  '   con otra cuenta de Google. Que abra el enlace en una ventana de incognito o cambie de cuenta.',
  '',
  '5) "La descarga se corta" (Game Box) -> Bajarlo desde computador, con conexion estable, y usar la descarga',
  '   alternativa si la primera falla. El archivo es muy pesado.',
  '',
  '6) "Como instalo la app" -> Dentro de la carpeta de la app hay documentos con las instrucciones paso a paso.',
  '',
  '7) "Perdi el enlace" -> Se le reenvia el de su zona. Recordarle guardar el correo: el acceso no se vence.',
  '',
  '## LO QUE NUNCA SE HACE',
  '- No se habla de reembolsos, devoluciones, cancelaciones ni cobros. Eso SIEMPRE se escala.',
  '- No se prometen fechas, descuentos, ni contenido que no este listado arriba.',
  '- No se inventan enlaces. Solo el de la zona que aparece en el contexto.',
  '- No se piden datos de tarjeta ni claves. Jamas.'
].join('\n');

// ============ TUS REGLAS ============
// Este bloque es TUYO. Escribe aca lo que quieras que la IA diga o deje de decir
// y se suma al final del prompt, sin tocar nada de lo de arriba.
// Ejemplo:
//   '- Si preguntan por un curso de Premiere, decir que por ahora no lo tenemos.',
//   '- Nunca decir "en breve": decir cuanto se demora de verdad o no decir nada.',
var REGLAS_DE_ESTEBAN = [

].join('\n');

// Frases que la IA NO puede escribir nunca, aunque suenen amables.
// Leccion aprendida en Helios: el tono amable no puede volverse una puerta.
// Ninguna respuesta puede dar por hecho un pago ni prometer un envio futuro.
var FRASES_PROHIBIDAS = [
  'tu pago fue', 'tu pago ya', 'confirmamos tu pago', 'recibimos tu pago',
  'ya te lo envio', 'ya te lo envío', 'te lo envio en', 'te lo envío en',
  'en breve te', 'en unos minutos te', 'pronto te llega', 'ya quedo enviado',
  'ya quedó enviado', 'te lo mando ahora', 'lo estamos enviando'
];

// Temas que obligan a escalar aunque el modelo diga otra cosa
var PALABRAS_ESCALAR = [
  'reembolso','reembolsar','devolucion','devolución','devuelv','plata de vuelta',
  'estafa','estafador','fraude','demanda','abogado','denuncia','profeco','condusef',
  'chargeback','contracargo','disputa','cobro doble','me cobraron dos',
  'no autorice','no autoricé','tarjeta robada'
];

// ============ ENTRADA ============

function revisarSoporte() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var etOk = etiqueta(ETIQUETA_OK), etHum = etiqueta(ETIQUETA_HUMANO);
    var hilos = GmailApp.search(
      'in:inbox is:unread -label:' + ETIQUETA_OK + ' -label:' + ETIQUETA_HUMANO,
      0, MAX_POR_CORRIDA);

    for (var i = 0; i < hilos.length; i++) {
      try { procesar(hilos[i], etOk, etHum); }
      catch (err) { registrar('', '', 'ERROR', err.message); }
    }
  } finally {
    lock.releaseLock();
  }
}

function procesar(hilo, etOk, etHum) {
  var msgs = hilo.getMessages();
  var ultimo = msgs[msgs.length - 1];
  var de = ultimo.getFrom();
  var correo = extraerCorreo(de);
  var asunto = ultimo.getSubject() || '(sin asunto)';
  var cuerpo = (ultimo.getPlainBody() || '').slice(0, 4000);

  // 1) filtros duros
  if (esIgnorable(de) || correo === buzon()) { hilo.markRead(); return; }

  // 2) tema delicado -> ni se le pregunta al modelo
  var texto = (asunto + ' ' + cuerpo).toLowerCase();
  for (var p = 0; p < PALABRAS_ESCALAR.length; p++) {
    if (texto.indexOf(PALABRAS_ESCALAR[p]) > -1) {
      return escalar(hilo, etHum, correo, asunto, 'tema sensible: ' + PALABRAS_ESCALAR[p]);
    }
  }

  // 3) quien es y que compro (Stripe)
  var compra = buscarCompra(correo);

  // 3b) si el pago esta reembolsado o en disputa, esto lo ve una persona
  if (compra && compra.problema) {
    return escalar(hilo, etHum, correo, asunto, 'pago con novedad: ' + compra.problema);
  }

  // 4) que dice la IA
  var marca = (compra && compra.marca) || marcaPorDestino(ultimo) || MARCA_POR_DEFECTO;
  var r = preguntarIA(asunto, cuerpo, compra, marca);
  if (!r || r.accion !== 'responder' || !r.cuerpo) {
    return escalar(hilo, etHum, correo, asunto, (r && r.motivo) || 'la IA no supo resolverlo');
  }

  // 5) validacion final del texto antes de enviarlo
  var bajo = r.cuerpo.toLowerCase();
  for (var q = 0; q < PALABRAS_ESCALAR.length; q++) {
    if (bajo.indexOf(PALABRAS_ESCALAR[q]) > -1) {
      return escalar(hilo, etHum, correo, asunto, 'la respuesta mencionaba un tema sensible');
    }
  }
  for (var w = 0; w < FRASES_PROHIBIDAS.length; w++) {
    if (bajo.indexOf(FRASES_PROHIBIDAS[w]) > -1) {
      return escalar(hilo, etHum, correo, asunto, 'frase prohibida: "' + FRASES_PROHIBIDAS[w] + '"');
    }
  }
  // Ningun enlace que no sea el de su zona.
  var enlaces = r.cuerpo.match(/https?:\/\/[^\s)]+/g) || [];
  for (var z2 = 0; z2 < enlaces.length; z2++) {
    if (!compra || !compra.enlace || enlaces[z2].indexOf(compra.enlace) !== 0) {
      return escalar(hilo, etHum, correo, asunto, 'la IA puso un enlace que no es su zona');
    }
  }
  // Nada de precios: los precios cambian y no son asunto de soporte.
  if (/(\$|usd|cop|mxn|clp|pesos)\s?\d/i.test(r.cuerpo)) {
    return escalar(hilo, etHum, correo, asunto, 'la respuesta mencionaba un precio');
  }

  responder(hilo, r.cuerpo, marca);
  hilo.markRead();
  hilo.addLabel(etOk);
  registrar(correo, asunto, 'RESPONDIDO', compra ? compra.resumen : 'sin compra encontrada');
}

function responder(hilo, cuerpo, marca) {
  var m = MARCAS[marca] || MARCAS[MARCA_POR_DEFECTO];
  var opciones = { htmlBody: aHtml(cuerpo, m.firma), name: m.firma };
  // Si el alias no esta verificado en Gmail, se manda igual desde el buzon.
  try {
    hilo.reply(cuerpo + '\n\n— ' + m.firma,
               { htmlBody: aHtml(cuerpo, m.firma), name: m.firma, from: m.alias });
  } catch (e) {
    hilo.reply(cuerpo + '\n\n— ' + m.firma, opciones);
  }
}

// ============ QUIEN ES EL CLIENTE (STRIPE) ============

/**
 * Busca el correo en las dos cuentas de Stripe y devuelve que compro.
 * Devuelve null si no aparece en ninguna.
 */
function buscarCompra(correo) {
  var props = PropertiesService.getScriptProperties();

  for (var c = 0; c < CUENTAS.length; c++) {
    var clave = props.getProperty(CUENTAS[c].prop);
    if (!clave) continue;

    var sesiones = buscarSesiones(clave, correo);
    // solo compras realmente pagadas
    sesiones = sesiones.filter(function (s) { return s.payment_status === 'paid'; });
    if (!sesiones.length) continue;

    // la mas reciente primero
    sesiones.sort(function (a, b) { return b.created - a.created; });
    var s = sesiones[0];

    var producto = nombreDelProducto(s);
    var nombre = (s.customer_details && s.customer_details.name) || '';
    var esGameBox = CUENTAS[c].marca === 'Game Box';

    // La cuenta de Game Box tambien alcanzo a vender CapCut al principio.
    var marca = (esGameBox && /CAPCUT/i.test(producto)) ? 'Curso CapCut' : CUENTAS[c].marca;
    var slug = marca === 'Game Box' ? zonaGameBox(producto) : zonaCapCut(producto);
    var zonas = marca === 'Game Box' ? ZONAS_GAMEBOX : ZONAS_CAPCUT;

    return {
      marca: marca,
      nombre: nombre,
      fecha: fechaLegible(s.created),
      producto: producto || '(sin nombre)',
      monto: (s.amount_total / 100).toFixed(2) + ' ' + String(s.currency).toUpperCase(),
      slug: slug,
      enlace: slug ? zonas[slug] : null,
      problema: novedadDelPago(clave, s),
      compras: sesiones.length,
      resumen: marca + ' · ' + (producto || '?') + (slug ? ' · zona ' + slug : ' · zona NO identificada')
    };
  }
  return null;
}

/** Busca las compras de ese correo. Cubre tambien las compras de invitado. */
function buscarSesiones(clave, correo) {
  var url = 'https://api.stripe.com/v1/checkout/sessions' +
            '?limit=20&expand[]=data.line_items' +
            '&customer_details%5Bemail%5D=' + encodeURIComponent(correo);
  var j = stripeGet(clave, url);
  return (j && j.data) ? j.data : [];
}

/** Nombre del producto que aparece en el checkout. */
function nombreDelProducto(s) {
  if (s.line_items && s.line_items.data && s.line_items.data.length) {
    return s.line_items.data[0].description || '';
  }
  return '';
}

/** Revisa si ese pago quedo reembolsado o en disputa. Si si, no se responde solo. */
function novedadDelPago(clave, s) {
  if (!s.payment_intent) return null;
  var j = stripeGet(clave, 'https://api.stripe.com/v1/charges?limit=1&payment_intent=' + s.payment_intent);
  if (!j || !j.data || !j.data.length) return null;
  var cargo = j.data[0];
  if (cargo.refunded) return 'reembolsado';
  if (cargo.amount_refunded > 0) return 'reembolso parcial';
  if (cargo.disputed) return 'en disputa';
  return null;
}

function stripeGet(clave, url) {
  try {
    var r = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + clave },
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) return null;
    return JSON.parse(r.getContentText());
  } catch (e) {
    return null;
  }
}

/** Nombre del producto -> zona de Game Box. */
function zonaGameBox(nombre) {
  var n = String(nombre).toUpperCase();
  var multi = n.indexOf('MULTICONSOLA') > -1;
  var mobile = n.indexOf('MOBILE') > -1;
  var leyenda = n.indexOf('LEYENDA') > -1;
  if (multi && mobile && leyenda) return 'u6q1';
  if (multi && mobile) return 'p3z8';
  if (multi && leyenda) return 'k9w4';
  if (multi) return 'r7m2';
  if (mobile && leyenda) return 'g4t9';
  if (mobile) return 'm7x2';
  return null;
}

/** Nombre del producto -> zona de CapCut. */
function zonaCapCut(nombre) {
  var n = String(nombre).toUpperCase();
  if (n.indexOf('TODO INCLUIDO') > -1 || n.indexOf('COMPLETO') > -1) return 'v4k9';
  var fx = n.indexOf('EFECTOS') > -1;
  var cin = n.indexOf('CINEMATICS') > -1;
  if (fx && cin) return 'v4k9';
  if (fx) return 'm8d3';
  if (cin) return 'r5t9';
  if (n.indexOf('CAPCUT') > -1) return 'k2f7';
  return null;
}

/** Si el correo llego reenviado, adivina el negocio por la direccion destino. */
function marcaPorDestino(msg) {
  try {
    var destinos = ((msg.getTo() || '') + ' ' + (msg.getCc() || '')).toLowerCase();
    if (destinos.indexOf('gamebox') > -1 || destinos.indexOf('game-box') > -1) return 'Game Box';
    if (destinos.indexOf('edicionpro') > -1 || destinos.indexOf('edicion-pro') > -1) return 'Curso CapCut';
  } catch (e) {}
  return null;
}

// ============ IA ============

function preguntarIA(asunto, cuerpo, compra, marca) {
  var clave = PropertiesService.getScriptProperties().getProperty('OPENAI_KEY');
  if (!clave) return null;

  var ctx = compra
    ? ('SI es cliente, verificado en Stripe.' +
       (compra.nombre ? ' Se llama ' + compra.nombre + '.' : '') +
       ' Compro: ' + compra.producto + ' (' + compra.marca + '), el ' + compra.fecha +
       ', por ' + compra.monto + '.' +
       (compra.compras > 1 ? ' Tiene ' + compra.compras + ' compras en total.' : '') +
       ' Su enlace de acceso es: ' + (compra.enlace || 'NO IDENTIFICADO, hay que escalar') + '.')
    : 'NO aparece ninguna compra con ese correo en ninguno de los dos negocios. ' +
      'Puede haber pagado con otro correo. Pidele con amabilidad el correo con el que pago ' +
      'o el nombre que aparece en el cobro, sin acusarlo de nada.';

  var sistema = [
    'Eres el soporte de dos negocios digitales. Respondes correos de clientes en espanol neutro de Latinoamerica.',
    'Tono: cercano, directo, sin rodeos, sin sonar robot. Frases cortas. Nada de "estimado cliente".',
    'No uses guiones largos. Nunca uses voseo. No inventes NADA que no este en la base de conocimiento.',
    'Este correo es del negocio: ' + marca + '.',
    '',
    'BASE DE CONOCIMIENTO:',
    CONOCIMIENTO,
    '',
    'CONTEXTO DE ESTE CLIENTE:',
    ctx,
    '',
    'Devuelve SOLO un JSON valido, sin texto alrededor, con esta forma:',
    '{"accion":"responder"|"escalar","cuerpo":"texto del correo","motivo":"por que escalas"}',
    '',
    'Usa accion "escalar" (y deja cuerpo vacio) cuando:',
    '- El tema toque dinero: reembolsos, cobros, disputas, cancelaciones.',
    '- El cliente este molesto, amenace, o pida hablar con una persona.',
    '- Aparezca como cliente pero su zona de acceso no este identificada.',
    '- No tengas la informacion para resolverlo con la base de conocimiento.',
    '- Te pidan algo fuera de estos dos productos.',
    '',
    'Si respondes: saluda por el nombre si lo sabes, resuelve el problema concreto,',
    'incluye el enlace de acceso SOLO si lo tienes en el contexto, y cierra ofreciendo ayuda si sigue el problema.',
    'Maximo 120 palabras. No firmes: la firma se agrega sola.',
    '',
    'PROHIBIDO DE FORMA ABSOLUTA (el tono amable no puede volverse una puerta):',
    '- Dar por hecho un pago: nada de "tu pago fue confirmado", "recibimos tu pago".',
    '- Prometer un envio futuro: nada de "en breve te llega", "ya te lo envio".',
    '  O el acceso ya esta y le pasas el enlace, o escalas. No hay punto medio.',
    '- Escribir precios, montos, descuentos o promociones. Ni uno.',
    '- Escribir cualquier enlace que no sea, literal, el enlace de acceso del contexto.',
    '- Inventar datos de pago, cuentas, numeros o direcciones.',
    '',
    'REGLAS ADICIONALES DE ESTEBAN:',
    REGLAS_DE_ESTEBAN || '(ninguna por ahora)'
  ].join('\n');

  var payload = {
    model: MODELO,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sistema },
      { role: 'user', content: 'Asunto: ' + asunto + '\n\nCorreo del cliente:\n' + cuerpo }
    ]
  };

  try {
    var r = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + clave },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) {
      registrar('', asunto, 'ERROR API', r.getContentText().slice(0, 200));
      return null;
    }
    var j = JSON.parse(r.getContentText());
    return JSON.parse(j.choices[0].message.content);
  } catch (e) {
    registrar('', asunto, 'ERROR API', e.message);
    return null;
  }
}

// ============ ESCALAR ============

function escalar(hilo, etHum, correo, asunto, motivo) {
  hilo.addLabel(etHum);
  hilo.markRead();
  try { GmailApp.starMessage(hilo.getMessages()[hilo.getMessageCount() - 1]); } catch (e) {}
  var para = AVISAR_A || buzon();
  try {
    MailApp.sendEmail({
      to: para,
      subject: '🔔 Soporte para revisar: ' + asunto,
      body: 'Un correo necesita que lo veas tu.\n\n' +
            'De: ' + correo + '\nAsunto: ' + asunto + '\nMotivo: ' + motivo + '\n\n' +
            'Esta en el buzon con la etiqueta ' + ETIQUETA_HUMANO + '.'
    });
  } catch (e) {}
  registrar(correo, asunto, 'ESCALADO', motivo);
}

// ============ UTILIDADES ============

function buzon() { return Session.getActiveUser().getEmail(); }

function extraerCorreo(de) {
  var m = String(de).match(/[\w.\-+]+@[\w.\-]+\.\w+/);
  return m ? m[0] : String(de);
}

function esIgnorable(de) {
  var d = String(de).toLowerCase();
  for (var i = 0; i < IGNORAR.length; i++) if (d.indexOf(IGNORAR[i]) > -1) return true;
  return false;
}

function etiqueta(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}

function fechaLegible(seg) {
  try { return Utilities.formatDate(new Date(seg * 1000), Session.getScriptTimeZone(), 'd MMM yyyy'); }
  catch (e) { return String(seg); }
}

function aHtml(t, firma) {
  var esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  esc = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return '<div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">' +
         esc.replace(/\n/g, '<br>') + '<br><br>— ' + firma + '</div>';
}

function hoja() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('HOJA_LOG');
  var libro = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('Soporte IA — registro');
  if (!id) props.setProperty('HOJA_LOG', libro.getId());
  var h = libro.getSheets()[0];
  if (h.getLastRow() === 0) h.appendRow(['Fecha', 'Correo', 'Asunto', 'Estado', 'Detalle']);
  return h;
}

function registrar(correo, asunto, estado, detalle) {
  try { hoja().appendRow([new Date(), correo, asunto, estado, detalle]); } catch (e) {}
}

// ============ INSTALACION Y PRUEBAS ============

/** Corre esto UNA vez para dejar el robot revisando cada 5 minutos. */
function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarSoporte') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarSoporte').timeBased().everyMinutes(5).create();
  Logger.log('Listo: revisa el buzon cada 5 minutos.');
}

/** Apaga el robot sin borrar nada. */
function apagarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarSoporte') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Robot apagado.');
}

/** Verifica que las tres claves esten puestas y que Stripe conteste. */
function revisarConfiguracion() {
  var p = PropertiesService.getScriptProperties();
  ['OPENAI_KEY', 'STRIPE_GAMEBOX', 'STRIPE_CAPCUT'].forEach(function (k) {
    Logger.log(k + ': ' + (p.getProperty(k) ? 'OK' : 'FALTA'));
  });
  CUENTAS.forEach(function (c) {
    var clave = p.getProperty(c.prop);
    if (!clave) return;
    var j = stripeGet(clave, 'https://api.stripe.com/v1/charges?limit=1');
    Logger.log(c.marca + ' -> ' + (j ? 'Stripe responde bien' : 'NO responde, revisa la clave'));
  });
  Logger.log('Buzon: ' + buzon());
}

/** Escribe aqui el correo de un cliente real y corre esto para ver si lo encuentra. */
function probarBusqueda() {
  var CORREO = 'pon.aqui.un.correo@ejemplo.com';
  var c = buscarCompra(CORREO);
  Logger.log(c ? JSON.stringify(c, null, 2) : 'No se encontro ninguna compra con ' + CORREO);
}

/** Prueba en seco: no manda nada, solo muestra que responderia. */
function probarSinEnviar() {
  var casos = [
    'Hola compre el curso ayer y no me llego nada, me pueden ayudar?',
    'El video no me carga en el celular, se queda cargando',
    'Quiero que me devuelvan mi dinero, esto es una estafa'
  ];
  for (var i = 0; i < casos.length; i++) {
    var texto = casos[i].toLowerCase();
    var sensible = PALABRAS_ESCALAR.some(function (p) { return texto.indexOf(p) > -1; });
    if (sensible) { Logger.log('CASO ' + (i + 1) + ' -> ESCALA sin preguntar a la IA'); continue; }
    var r = preguntarIA('Prueba', casos[i], null, 'Curso CapCut');
    Logger.log('CASO ' + (i + 1) + ' -> ' + (r ? r.accion + ': ' + (r.cuerpo || r.motivo) : 'sin respuesta de la API'));
  }
}
