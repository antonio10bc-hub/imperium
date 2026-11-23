# Imperium

Juego de estrategia en tiempo real con estética voxel (Three.js por CDN), sin dependencias ni instalación.

## Cómo jugar

- **Desarrollo**: sirve la carpeta (`npm start` o `python3 -m http.server 8000`) y abre http://localhost:8000. El código está en módulos ES dentro de `src/`, y el navegador no los carga con doble clic (`file://`).
- **Un solo archivo**: `npm run build` (o `node tools/build.mjs`) genera `dist/imperium.html`, que se abre con doble clic y se puede compartir tal cual.

## Qué tiene

- Mapas de 384×256 con once geografías irregulares (río, cordillera, istmo, archipiélago, barrancos, meseta, afluentes, delta, bosque, desierto y caldera), elegibles en el menú o al azar. El generador descarta las semillas desequilibradas (mismos pueblos por mitad y distancias por camino parecidas).
- Terreno con reglas: pantanos y bajíos frenan (más a los jinetes), el bosque denso no se atraviesa, los tiradores desde dos niveles por encima ganan alcance y daño, y la cima de la meseta da oro doble. Caminos entre pueblos y niebla de guerra.
- Dos campamentos con guardianes neutrales: al conquistarlos dan jinetes arqueros (hasta 20 por campamento).
- Seis civilizaciones (Roma, Cartago, Han, mexicas, Egipto y galos) con la misma lógica y aspecto propio; se eligen en el menú para ti y para el rival, o al azar.
- Cada civilización trae su bioma, sus pueblos y una fortaleza con muralla y distribución propias; el mapa se reparte 50/50 entre las dos.
- Para añadir una civilización nueva, sigue [docs/checklist-civilizacion.md](docs/checklist-civilizacion.md).
- Barra inferior: minimapa, panel de selección (cuartel, altar, pueblos con mejoras, tropas agrupadas por tipo) y herramientas.
- Las tropas seleccionadas se mueven en formación y al paso del más lento. **E** activa ataque-mover.
- El héroe aparece a la izquierda con sus tropas asignadas (hasta 50), que forman delante de él en bloque, línea o cuña.

## Notas técnicas (rendimiento)

- **Modelos fundidos**: tropas y edificios se escriben con cajas sueltas, pero `bake()` y `unitTemplate()` las funden en dos mallas (color por vértice y contorno). Cada combinación civilización + tipo + bando se construye una vez y todas las tropas la comparten; el rango es una variante de color de la plantilla.
- **Recursos compartidos**: materiales, anillos y sombras salen de cachés; partículas y flechas, de un pool. Al empezar otra partida se liberan las geometrías de edificios y murallas.
- **Rejilla espacial** (`UGRID`): separación, enemigo más cercano, conquista, torres y murallas consultan solo las celdas cercanas. Devuelve las unidades por id para que los desempates sean los de siempre.
- **Navegación**: `stepMask` guarda por casilla a qué vecinas se puede pasar; `bfs(origen, stop)` puede parar al llegar a una casilla (persecuciones).
- `window.__game` expone el estado y `step(n)` para pruebas automáticas.

## Estructura del código (`src/`)

| Módulo | Qué contiene |
|---|---|
| `config.js` | Tamaño del mapa, bandos, tropas, rangos, economía y dificultad |
| `state.js` | Estado de sesión compartido `S` (selección, cámara, pausa, preferencias) y `$` |
| `render.js` | Renderizador, escena, cámara, post-proceso, materiales y fusión de piezas (`bake`) |
| `noise.js`, `geo.js` | Ruido con semilla y las diez geografías |
| `map.js` | Datos del mapa y su generación: alturas, fortalezas, regiones, pueblos, caminos, árboles y vóxeles |
| `nav.js` | Casillas transitables, BFS y casilla más cercana |
| `minimap.js`, `fog.js` | Minimapa y niebla de guerra |
| `civs.js` | Civilizaciones: modelos, murallas, biomas y elección |
| `buildings.js` | Castillo, cuartel, altar, pueblos, campamentos, murallas y cambio de dueño |
| `units.js` | Plantillas de tropas, miniaturas, aparición, movimiento y rejilla espacial |
| `combat.js`, `behavior.js` | Daño, rangos y muertes; formaciones, órdenes, escolta e IA de cada tropa |
| `game.js` | Partida: producción, héroes, pueblos, defensas, IA del rival y paso de simulación |
| `hud.js`, `input.js`, `menu.js`, `overlay.js` | Interfaz, ratón/teclado/cámara, menú principal y capa 2D |
| `main.js` | Arranque y bucle principal |

Reglas para que siga escalando:

- Cada módulo importa lo que usa. Un módulo no puede reasignar una variable de otro: el estado compartido que cambia desde varios sitios va en `S` (`state.js`); el resto lo cambia su propio módulo, con una función si hace falta (`setSeed`, `markMiniDirty`…).
- Los módulos base (`config`, `state`, `render`, `noise`, `geo`, `civs`) no importan de los demás. El resto se importan entre sí en ciclo, así que su código de nivel superior solo declara cosas. Lo que toca la página (listeners, DOM) va en su `init()`, que llama `main.js`.
