# Lista de comprobación: civilización nueva

Todas las civilizaciones comparten la misma lógica (estadísticas, costes, counters e IA). Lo que cambia es el aspecto, los edificios, el mapa y los nombres. Esta lista recoge todo lo que tiene que tener una civilización para estar completa.

## Dónde va cada cosa en `index.html`

| Qué | Dónde |
|---|---|
| Tropas, fortaleza, cuartel, casa, nombres, paleta, color propio | array `CIVS` dentro del módulo `CIV` (sección *Civilizaciones*) |
| Colores de muralla | objeto `WALLS` del mismo módulo |
| Bioma, árboles, rasgo de paisaje, forma y estilo de muralla, distribución del recinto, altar | objeto `MAPS` del mismo módulo |
| Árboles nuevos | función `treeBoxes` |
| Rasgo de paisaje nuevo | función `featureAt` (y piezas pequeñas en `buildVoxels`) |

## Identidad
- [ ] **Nombre y época**: nombre corto en mayúsculas para el selector y una época para las fichas.
- [ ] **Color propio** (`own`): no puede parecerse al azul (`#3a6ad8`) ni al rojo (`#d83a4a`) de bando.
- [ ] **Paleta de 4 colores**: materiales dominantes (piedra, tejado, metal, tela).
- [ ] **Silueta única**: un rasgo (escudo, casco, montura o arma) que ninguna otra civilización tenga.

## Tropas
- [ ] **Espada, arco, jinete y héroe**: los cuatro modelos, construidos dentro del grupo que recibe la función (el `body`), para que funcionen golpe, retroceso y caída.
- [ ] **Color de bando visible**: escudo, estandarte o penacho con el color `T` que recibe la función. El anillo lo pone el juego.
- [ ] **Tamaño dentro de la huella**: monturas grandes (elefante, carro) sin pasar de ~1,5 casillas de ancho.
- [ ] **Prueba de distancia**: se distingue de las demás en una línea de batalla con el mismo color de bando.
- [ ] **Nombres de las 4 tropas** (`names`): en singular; revisar cómo queda el plural en el panel de selección.
- [ ] **Miniaturas**: el retrato de 72 px (se genera solo a partir del modelo) se lee bien.
- [ ] **Cresta de rango**: el cubo de bronce, plata u oro queda por encima de la cabeza o del penacho (se coloca solo según la altura del modelo; comprobarlo).

## Fortaleza
- [ ] **Castillo, cuartel y altar**: los tres modelos (`castle`, `barracks` y `MAPS.altar`).
- [ ] **Distribución propia** (`layout`): posición, giro y escala de los tres edificios en coordenadas locales del recinto (+z = hacia el centro del mapa), sin solaparse con la muralla.
- [ ] **Muralla** (`shape` y `wall`): forma del recinto, anillos (`rings`), altura, grosor, almenas, torres, contrafuertes o empalizada.
- [ ] **Tres puertas**: el juego las abre siempre hacia el centro del mapa y a ±120°. El modelo de puerta (`wall.gate`) deja libre un hueco de 3,6 casillas.
- [ ] **Suelo del recinto**: `plaza`, `wallbase`, `path`, `between` (si hay doble muralla) e `inside` (calles o ejes interiores).
- [ ] **Foso u otros obstáculos** (`moat`): que dejen paso en las tres puertas.
- [ ] **Sombras y selección**: el radio de la sombra y del anillo de selección encaja con el tamaño del edificio.

## Mapa
- [ ] **Bioma** (`ground`, `lush`, `sand`, `road`): cuatro tonos de suelo, suelo bajo los árboles, arena de orilla y caminos.
- [ ] **Vegetación** (`trees`, `treeCol`, `dens`): dos tipos de árbol bajos (las tropas tienen que sobresalir), color en el minimapa y densidad.
- [ ] **Rasgo de paisaje** (`feature`): campos, arrozales, dunas, salinas… que no bloqueen el paso más que un bosque.
- [ ] **Pueblo propio**: la `house` de la civilización se usa en los pueblos de su orilla; la torre y la empalizada toman el color de muralla.
- [ ] **Mezcla 50/50**: probar la franja de mezcla junto al río contra cada una de las demás civilizaciones.
- [ ] **Minimapa y niebla**: los colores del bioma se distinguen en el minimapa y bajo la niebla de guerra.

## Sonido e interfaz
- [ ] **Música**: escala y uno o dos instrumentos propios (pendiente: ahora la música es común).
- [ ] **Efectos**: cuerno o llamada de ataque y fanfarria de conquista (pendiente: ahora son comunes).
- [ ] **Selector e instrucciones**: aparece en los dos selectores del menú (sale solo de `CIVS`) y se menciona en la pantalla de instrucciones si tiene algo especial.

## Pruebas
- [ ] **Partida completa** contra cada civilización y en espejo contra sí misma.
- [ ] **Navegación**: las tropas salen del recinto por las tres puertas y llegan a un punto exterior sin atascarse.
- [ ] **Niebla de guerra**: edificios y murallas quedan ocultos hasta explorarlos.
- [ ] **Rendimiento**: los modelos se funden solos en dos mallas (tropas y edificios), así que el número de piezas casi no cuesta. Basta con construirlos con `P()` (cajas); cualquier otra geometría quedaría suelta y sí costaría. 80 tropas en pantalla sin bajones.
- [ ] **Piezas animadas o que cambian de color** en edificios: hay que dejarlas fuera de la fusión pasándolas en el `skip` de `bake()` (como las banderas y los tejados de los pueblos).
- [ ] **Móvil**: se ve y se selecciona bien en pantalla pequeña.
