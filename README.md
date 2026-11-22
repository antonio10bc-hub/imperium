# Imperium

Juego de estrategia en tiempo real con estética voxel, en un único archivo HTML (Three.js por CDN).

Para jugar, abre `index.html` en el navegador.

- Mapa único de 384×256: dos llanuras separadas por un río con vados, caminos entre pueblos (dan velocidad) y niebla de guerra que oculta lo no explorado.
- Dos campamentos con guardianes neutrales: al conquistarlos dan jinetes arqueros (hasta 20 por campamento).
- Seis civilizaciones (Roma, Cartago, Han, mexicas, Egipto y galos) con la misma lógica y aspecto propio; se eligen en el menú para ti y para el rival, o al azar.
- Cada civilización trae su bioma, sus pueblos y una fortaleza con muralla y distribución propias; el mapa se reparte 50/50 entre las dos.
- Para añadir una civilización nueva, sigue [docs/checklist-civilizacion.md](docs/checklist-civilizacion.md).
- Barra inferior: minimapa, panel de selección (cuartel, altar, pueblos con mejoras, tropas agrupadas por tipo) y herramientas.
- Las tropas seleccionadas se mueven en formación y al paso del más lento. **E** activa ataque-mover.
- El héroe aparece a la izquierda con sus tropas asignadas (hasta 50), que forman delante de él en bloque, línea o cuña.
