#!/bin/bash
cd /home/inith/clawtrader
~/.foundry/bin/forge build --silent 2>&1
python3 - <<'PYEOF'
import json
with open('out/AgentVaultV2.sol/AgentVaultV2.json') as f:
    data = json.load(f)
bytecode = data['bytecode']['object']
print(f"Bytecode length: {len(bytecode)} chars")
with open('/tmp/AgentVaultV2.bytecode', 'w') as f:
    f.write(bytecode)
print("Written to /tmp/AgentVaultV2.bytecode")
PYEOF
cp /tmp/AgentVaultV2.bytecode /mnt/g/Polygon/ClawTrader-main/scripts/AgentVaultV2.bytecode
echo "DONE"
