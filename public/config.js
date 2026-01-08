// public/config.js
window.PB_CONFIG = {
  ARC: {
    chainIdHex: '0x4cef52', // 5042002
    chainName: 'Arc Testnet',
    rpcUrls: ['https://rpc.testnet.arc.network'],
    blockExplorerUrls: ['https://testnet.arcscan.app'],
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  },

  // Arc USDC ERC-20 interface (6 decimals)
  USDC_ERC20: '0x3600000000000000000000000000000000000000',

  // ВСТАВЬ СЮДА АДРЕС КОНТРАКТА ИЗ ARCSCAN
  ESCROW_ADDRESS: '0x6C6E2246Bd0E6338Ea4508adcaE807b1Bf0515Ff',

  ERC20_ABI: [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ],

  ESCROW_ABI: [
    'function deposit(uint256 battleId, uint256 amount) external',
  ],
}
