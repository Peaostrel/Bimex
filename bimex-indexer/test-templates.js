import { tmplBienvenida, tmplContribucion, tmplAprobacionHTML, tmplYieldDisponible } from './templates/htmlTemplates.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'test-output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const mockData = {
  nombre: 'Usuario de Prueba',
  nombreProyecto: 'Proyecto Solar Comunitario',
  monto: '5,000.00',
  progreso: '65',
  yield: '250.00',
  fecha: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
  proyectoUrl: 'https://bimex-frontend.vercel.app/proyectos/1',
};

fs.writeFileSync(path.join(outputDir, 'bienvenida.html'), tmplBienvenida(mockData));
fs.writeFileSync(path.join(outputDir, 'contribucion.html'), tmplContribucion(mockData));
fs.writeFileSync(path.join(outputDir, 'aprobacion.html'), tmplAprobacionHTML(mockData));
fs.writeFileSync(path.join(outputDir, 'yield-disponible.html'), tmplYieldDisponible(mockData));

console.log('Templates generados en test-output/');
console.log('Abre los archivos HTML en tu navegador para previsualizar.');
