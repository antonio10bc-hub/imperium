# Imperium

Juego de estrategia en tiempo real con estética voxel, en un único archivo HTML (Three.js por CDN).

Para jugar, abre `index.html` en el navegador.

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
