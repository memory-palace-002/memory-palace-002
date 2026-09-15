/**
 * 其它板块占位页 —— 只声明路由与边界，避免乙越界实现别人的代码；
 * 各板块完成后用自己的页面替换这里的导出即可（路由一行改动）。
 */
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/Misc';

function Stub({
  owner,
  title,
  desc,
  onBack,
  action,
}: {
  owner: string;
  title: string;
  desc: string;
  onBack?: () => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="page fade-in">
      <PageHeader title={title} onBack={onBack} />
      <div className="shell stub">
        <div className="stub__badge">由 {owner} 负责实现</div>
        <div className="stub__title">{title}</div>
        <p className="stub__desc">{desc}</p>
        {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
      </div>
    </div>
  );
}

/** P1 登录页（板块① 甲） */
export function LoginPage() {
  const navigate = useNavigate();
  return (
    <Stub
      owner="甲（板块① 地基与账号）"
      title="登录"
      desc="手机号 + 短信验证码登录、微信可选登录、分享链接回跳登录，由板块①实现。"
      action={{ label: '返回宫殿列表', onClick: () => navigate('/palaces') }}
    />
  );
}

/** P4 3D 展示柜主视图（板块③ 丙） */
export function CabinetViewPage() {
  const { cabinetId = '' } = useParams();
  const navigate = useNavigate();
  return (
    <Stub
      owner="丙（板块③ 3D 核心视图）"
      title="3D 展示柜"
      desc={`柜 ${cabinetId.slice(0, 8)} 的 R3F 场景、灯光、placed item 与 hover/tap 拾取，由板块③实现。`}
      onBack={() => navigate(-1)}
      action={{ label: '回到柜子列表', onClick: () => navigate('/palaces') }}
    />
  );
}

/** P6 物品摆放编辑页（板块③ 丙） */
export function PlacePage() {
  const { cabinetId = '' } = useParams();
  const navigate = useNavigate();
  return (
    <Stub
      owner="丙（板块③ 3D 核心视图）"
      title="摆放编辑"
      desc={`柜 ${cabinetId.slice(0, 8)} 的拖拽 / 缩放 / 旋转与 I2 节流提交，由板块③实现。`}
      onBack={() => navigate(-1)}
    />
  );
}

/** P5 3D 扫描页（板块④ 丁） */
export function ScanPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  return (
    <Stub
      owner="丁（板块④ 轻量 3D 生成）"
      title="3D 扫描"
      desc={`类型 ${search.get('type') ?? '-'}、模式 ${search.get('mode') ?? '拍照'}。取景引导、照片直传与 auto 生成管线，由板块④实现。`}
      onBack={() => navigate(-1)}
    />
  );
}

/** P10 个人中心页（板块① 甲） */
export function MePage() {
  const navigate = useNavigate();
  return (
    <Stub
      owner="甲（板块① 地基与账号）"
      title="个人中心"
      desc="头像昵称、手机号脱敏、微信绑定、我的宫殿与退出登录，由板块①实现。"
      onBack={() => navigate(-1)}
      action={{ label: '返回首页', onClick: () => navigate('/palaces') }}
    />
  );
}

/** 分享查看页（板块⑥） */
export function SharedPage() {
  const navigate = useNavigate();
  return (
    <Stub
      owner="大家（板块⑥ 分享与打磨）"
      title="分享查看"
      desc="登录墙 + 只读查看，由板块⑥实现。"
      action={{ label: '去登录', onClick: () => navigate('/login') }}
    />
  );
}

/** 兜底 404 */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Stub
      owner="—"
      title="走错房间了"
      desc="这个地址不存在，回到你的宫殿列表吧。"
      action={{ label: '回首页', onClick: () => navigate('/palaces') }}
    />
  );
}
