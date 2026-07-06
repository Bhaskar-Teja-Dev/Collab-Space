import styles from './Skeleton.module.css';

interface Props {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export default function Skeleton({
  width = '100%',
  height = '100%',
  borderRadius = 'var(--radius-md)',
  className = '',
}: Props) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius,
  };

  return <div className={`${styles.skeleton} ${className}`} style={style} />;
}
