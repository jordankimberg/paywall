import { Routes, Route } from 'react-router-dom';
import Plans from './pages/Plans';
import Checkout from './pages/Checkout';
import Success from './pages/Success';

export default function App() {
  return (
    <Routes>
      <Route path="/subscribe" element={<Plans />} />
      <Route path="/pay" element={<Checkout />} />
      <Route path="/success" element={<Success />} />
    </Routes>
  );
}
