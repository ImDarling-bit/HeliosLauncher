// Style sombre Google Maps (Android). Sur iOS, Apple Maps utilise
// `userInterfaceStyle="dark"` à la place.
export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c7c7c7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121212' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#4a4a4a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#5a5a5a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2233' }] },
];
