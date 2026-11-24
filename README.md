# Imperium

Juego de estrategia en tiempo real con estética voxel (Three.js por CDN), sin dependencias ni instalación.

## Cómo jugar

- **Desarrollo**: sirve la carpeta (`npm start` o `python3 -m http.server 8000`) y abre http://localhost:8000. El código está en módulos ES dentro de `src/`, y el navegador no los carga con doble clic (`file://`).
- **Un solo archivo**: `npm run build` (o `node tools/build.mjs`) genera `dist/imperium.html`, que se abre con doble clic y se puede compartir tal cual.

## Qué tiene

- De 2 a 5 jugadores, todos contra todos (hasta 3 en el mapa normal y 5 en el grande): las fortalezas se reparten alrededor del mapa, cada una con el suelo de su civilización, y un rival cuya fortaleza cae queda eliminado.
- Tres tamaños de mapa (288×192, 384×256 y 480×320, con 12, 16 o 22 pueblos) y código de mapa (`GEOGRAFÍA-SEMILLA[-P|-G]`, también como `?mapa=` en la dirección) para repetir o compartir un mapa.
- Mapas con catorce geografías (cordillera, istmo, archipiélago, barrancos, meseta, afluentes, delta, bosque, desierto, caldera, valle helado, cañón, costa y ruinas), elegibles en el menú o al azar. El generador descarta las semillas desequilibradas (mismos pueblos por mitad y distancias por camino parecidas).
- Los pueblos respetan la geografía: su explanada nunca cae sobre un río, un vado, una rampa, un puerto, un puente ni el borde de la meseta (todo el suelo que cubre está a la misma altura).
- Aspecto: luz propia de cada geografía, sombras largas de laderas y árboles, agua más oscura cuanto más honda, alrededores del mapa (lomas o islotes que se pierden en la bruma), transición suave entre los suelos de las civilizaciones, matas, flores y piedras, cunetas y rodadas en los caminos, postes con el nombre del pueblo, patio de la fortaleza con pozo, carros y estandartes, y un gran hito único en cada geografía (cascada, coloso, arco de roca, crómlech, acueducto, zigurat, árbol gigante, esqueleto, obelisco, agujas de hielo, rostro tallado, galeón y cabeza de estatua).
- Cada geografía tiene una regla propia (`src/rules.js`): nieve y atalayas en los puertos de la cordillera, ciudadela en el istmo, mareas en el archipiélago, emboscadas en los barrancos, rampas estrechas en la meseta, crecidas en los afluentes, pantanos que ocultan en el delta, tala en el bosque, sed en el desierto, volcán en la caldera, hielo que se rompe en el valle helado, tres puentes distintos en el cañón (se derriban con tropas; el fortificado se conquista) y tesoros en las ruinas.
- Ambiente (`src/ambient.js`): clima por geografía que reduce un poco la visión mientras dura, pájaros, humo en los pueblos, espuma en la costa, peces y elementos propios de cada geografía (faros, barcas, molinos, menhires, pirámides, estatuas, palafitos…), que no se atraviesan.
- Terreno con reglas: pantanos y bajíos frenan (más a los jinetes), el bosque denso no se atraviesa, los tiradores desde dos niveles por encima ganan alcance y daño, y la cima de la meseta da oro doble. Caminos entre pueblos y niebla de guerra.
- Dos campamentos con guardianes neutrales: al conquistarlos dan jinetes arqueros (hasta 20 por campamento).
- En el centro, una ciudadela guardada por colosos: quien la conquista recibe colosos (hasta 10), lentos, duros y cuerpo a cuerpo.
- Una atalaya en cada mitad, en la franja central: no da oro, pero da visión lejana y su torre dispara más lejos.
- Oro con rendimiento decreciente: cada pueblo propio rinde un 8 % menos que el anterior (mínimo 45 %).
- Once civilizaciones (Roma, Cartago, Han, mexicas, Egipto, galos, Grecia, vikingos, Persia, mongoles y Japón) con aspecto, música y ventaja propios (legiones, comercio, ballestas, conquista rápida, carros, furia, falange, saqueo, inmortales, estepa y bushido); se eligen en el menú para ti y para el rival, o al azar.
- Cada civilización trae su bioma, sus pueblos y una fortaleza con muralla y distribución propias; el mapa se reparte 50/50 entre las dos.
- Para añadir una civilización nueva, sigue [docs/checklist-civilizacion.md](docs/checklist-civilizacion.md).
- Barra inferior: minimapa, panel de selección (cuartel, altar, pueblos con mejoras, tropas agrupadas por tipo) y herramientas.
- Las tropas seleccionadas se mueven en formación y al paso del más lento. **E** activa ataque-mover.
- El límite de tropas crece con el territorio: 30 de base y 6 por cada pueblo o campamento (hasta 100).
- Las tropas seleccionadas muestran una línea hasta su destino (verde: mover, roja: atacar o asediar, amarilla: conquistar).
- Las fortalezas dañadas echan humo y fuego, y los pueblos mejorados ganan construcciones.
- Fortalezas grandes, con muralla cerrada y tres puertas que solo se abren a su dueño: los enemigos tienen que derribarlas (el **ariete** lo hace rápido) o bombardear el castillo desde fuera con **catapultas** (daño en área). Ambos se reclutan en el cuartel (teclas 4 y 5). Las puertas se reparan desde la fortaleza (H).
- La muralla se mejora tres veces desde la fortaleza: sus doce arqueros, visibles en las almenas, pasan a bronce, plata y oro (más daño, alcance y cadencia) y las puertas aguantan más.
- Cada fortaleza tiene castillo, cuartel, salón de héroes y templo. En el templo, un ritual (400 de oro, 1 minuto) permite invocar al dios de la civilización (uno por bando): flota, golpea cuerpo a cuerpo y, asignado a un héroe, va detrás de él curando a su escolta.
- Cuartel, salón de héroes y templo tienen cada uno su punto de reunión (clic derecho con el edificio seleccionado).
- Eventos neutrales cada ~2 minutos: bandidos que asaltan al líder en territorio, mercenarios veteranos a la venta y caravanas de tres carros con oro.
- Cada líder rival tiene nombre (Aníbal, Escipión, Gengis…) y una personalidad al azar que se anuncia al empezar: **agresivo**, **mercader**, **defensivo** (guarnición y muralla pronto) o **relámpago** (ataca muy pronto, con jinetes). Cambia cuándo ataca, cuánto invierte y cuándo trae asedio.
- La ciudadela central es más grande (con más colosos alrededor) y su círculo de conquista también.
- Interfaz: presentación de la partida (duelo de civilizaciones con viaje de cámara; un clic la salta), pantalla final con gráfica de pueblos y tropas, tabla por bando, héroe más valioso, momentos clave y **revancha**; cajas de ayuda en botones y edificios; flechas en el borde hacia los ataques fuera de la vista (se pueden pulsar); barra de territorio con el color de cada rival y destellos al ganar o perder pueblos; rótulos flotantes que no se pisan.
- IA rival: en fácil, la IA simple con menos oro; en normal y difícil, una IA sin trampas (mismo oro que tú, solo sabe lo que ven sus tropas) que contrarresta tu ejército, defiende sus pueblos, cura a sus heridos y concentra fuerzas. En difícil decide más a menudo y concentra el fuego.
- **ESC** (o el botón ☰) abre el menú de pausa: continuar, reiniciar el mismo mapa, rendirse o volver al menú principal.
- El héroe aparece a la izquierda con sus tropas asignadas (hasta 50), que forman delante de él en bloque, línea o cuña.

## Pruebas

Tras `npm install` (solo herramientas de desarrollo) y `npm run build`:

- `npm run check`: revisa los módulos de `src/` (importaciones sin usar, nombres sin importar, exportaciones que no existen).
- `npm run smoke`: juega IA contra IA en cada geografía con Chrome sin ventana y falla si hay algún error (`-- --geo=canon,lago --min=4 --size=g`).
- `npm run bench`: mapa grande con 200 tropas peleando; mide el paso de simulación y los fotogramas por segundo (`-- --units=300 --geo=helado`).

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
| `ai.js` | IA de los bandos: cerebro simple (la original) y smart |
| `events.js` | Eventos neutrales: bandidos, mercenarios y caravanas |
| `ambient.js` | Clima, vida en el paisaje y elementos propios de cada geografía |
| `rules.js` | Reglas propias de cada geografía (puentes, mareas, crecidas, tala, sed, volcán, tropas ocultas) |
| `combat.js`, `behavior.js` | Daño, rangos y muertes; formaciones, órdenes, escolta e IA de cada tropa |
| `stats.js` | Estadísticas de la partida y pantalla final |
| `game.js` | Partida: producción, héroes, pueblos, defensas, IA del rival y paso de simulación |
| `hud.js`, `input.js`, `menu.js`, `overlay.js` | Interfaz, ratón/teclado/cámara, menú principal y capa 2D |
| `main.js` | Arranque y bucle principal |

Reglas para que siga escalando:

- Cada módulo importa lo que usa. Un módulo no puede reasignar una variable de otro: el estado compartido que cambia desde varios sitios va en `S` (`state.js`); el resto lo cambia su propio módulo, con una función si hace falta (`setSeed`, `markMiniDirty`…).
- Los módulos base (`config`, `state`, `render`, `noise`, `geo`, `civs`) no importan de los demás. El resto se importan entre sí en ciclo, así que su código de nivel superior solo declara cosas. Lo que toca la página (listeners, DOM) va en su `init()`, que llama `main.js`.
