import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Game } from './Game';
import { Gallery } from './sections/Gallery';
import { Profile } from './sections/Profile'; // 👈 ИМПОРТИРУЕМ ПРОФИЛЬ
import { Admin } from './Admin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Game />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/profile" element={<Profile />} /> {/* 👈 ДОБАВЛЯЕМ МАРШРУТ */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}