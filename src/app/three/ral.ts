/** Bảng màu sơn RAL (không import three — dùng được ở mọi nơi). */
export const RAL_COLORS: { code: string; name: string; hex: string }[] = [
  { code: '7035', name: 'Xám sáng', hex: '#D7D7D7' },
  { code: '7032', name: 'Xám sỏi', hex: '#B9B8A9' },
  { code: '7016', name: 'Xám antraxit', hex: '#383E42' },
  { code: '9003', name: 'Trắng', hex: '#F2F2EE' },
  { code: '9005', name: 'Đen', hex: '#16171A' },
  { code: '5015', name: 'Xanh dương', hex: '#2271B3' },
  { code: '1021', name: 'Vàng', hex: '#F3B800' },
];

export function ralHex(code?: string): string {
  return RAL_COLORS.find((r) => r.code === code)?.hex ?? '#D7D7D7';
}

