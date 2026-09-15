/** 桌面端顶部导航（§4.4 NavBar，Tab 栏在桌面转为顶部导航） */
import { useNavigate } from 'react-router-dom';
import { IconPalace, IconUser } from '../ui/Icons';
import { Avatar } from '../ui/Misc';
import { useAuth } from '../../app/AuthContext';
import { useCreatePalace } from '../../features/palaces/CreatePalaceContext';
import { IconPlus } from '../ui/Icons';

export function NavBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openCreate } = useCreatePalace();

  return (
    <nav className="navbar">
      <div className="shell navbar__inner">
        <button className="navbar__brand" onClick={() => navigate('/palaces')}>
          <IconPalace size={22} />
          <span className="serif">小角落</span>
        </button>

        <div className="navbar__links">
          <button className="navbar__link" onClick={() => navigate('/palaces')}>
            <IconPalace size={18} />
            我的宫殿
          </button>
          <button className="navbar__link" onClick={() => navigate('/me')}>
            <IconUser size={18} />
            个人中心
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => openCreate()}>
            <IconPlus size={18} />
            新建
          </button>
          {user ? (
            <button
              className="navbar__avatar"
              onClick={() => navigate('/me')}
              aria-label="个人中心"
            >
              <Avatar name={user.nickname} src={user.avatar_url} size={34} />
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
