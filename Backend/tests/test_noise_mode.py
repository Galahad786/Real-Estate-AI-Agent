import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "agent.py"
BACKEND_PATH = str(MODULE_PATH.parent)
if BACKEND_PATH not in sys.path:
    sys.path.insert(0, BACKEND_PATH)

SPEC = importlib.util.spec_from_file_location("agent_module", MODULE_PATH)
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class NoiseModeTests(unittest.TestCase):
    def test_noise_mode_defaults_to_off(self):
        with patch.dict(module.os.environ, {}, clear=True):
            self.assertEqual(module.get_noise_mode(), "off")

    def test_noise_mode_parses_dtln(self):
        self.assertEqual(module.get_noise_mode("dtln"), "dtln")

    def test_room_input_options_off(self):
        self.assertIsNone(module.build_room_input_options("off"))

    def test_room_input_options_dtln(self):
        options = module.build_room_input_options("dtln")

        self.assertIsNotNone(options)
        self.assertIsNotNone(options.noise_cancellation)


if __name__ == "__main__":
    unittest.main()
