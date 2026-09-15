/** 移动端底部 TabBar，中央暖陶红「+」（§4.3 P2） */
import { useLocation, useNavigate } from 'react-router-dom';
import { IconPalace, IconPlus, IconUser } from '../ui/Icons';
import { useCreatePalace } from '../../features/palaces/CreatePalaceContext';

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { openCreate } = useCreatePalace();

  const active = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="tabbar">
      <button
        className={`tabbar__item ${active('/palaces') ? 'is-active' : ''}`}
        onClick={() => navigate('/palaces')}
      >
        <IconPalace size={21} />
        <span>宫殿</span>
      </button>

      <button className="tabbar__fab" onClick={() => openCreate()} aria-label="新建宫殿">
        <IconPlus size={26} />
      </button>

      <button
        className={`tabbar__item ${active('/me') ? 'is-active' : ''}`}
        onClick={() => navigate('/me')}
      >
        <IconUser size={21} />
        <span>我的</span>
      </button>
    </nav>
  );
}
