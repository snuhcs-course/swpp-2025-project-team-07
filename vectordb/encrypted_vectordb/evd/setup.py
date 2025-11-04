from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext
import sys
import os
import subprocess
import setuptools
import platform
import shlex

__version__ = '0.0.1'

class CMakeExtension(Extension):
    def __init__(self, name, sourcedir=''):
        super().__init__(name, sources=[])
        self.sourcedir = os.path.abspath(sourcedir)

class CMakeBuild(build_ext):
    def run(self):
        try:
            subprocess.check_output(['cmake', '--version'])
        except OSError:
            raise RuntimeError("CMake must be installed to build the extension")

        for ext in self.extensions:
            self.build_extension(ext)

    def build_extension(self, ext):
        extdir = os.path.abspath(os.path.dirname(self.get_ext_fullpath(ext.name)))

        cmake_args = [
            f'-DCMAKE_LIBRARY_OUTPUT_DIRECTORY={extdir}',
            f'-DPython3_EXECUTABLE={sys.executable}',
            '-DBUILD_PYTHON=ON',
            '-DEVD_BUILD_EXAMPLES=OFF',
            '-DCMAKE_BUILD_TYPE=Release',
        ]

        if platform.system() == "Darwin" and platform.machine() == "arm64":
            cmake_args += ['-DCPU_FEATURES_ARCH_ARM=ON', '-DCMAKE_OSX_ARCHITECTURES=arm64']

        env_cmake_args = os.environ.get("CMAKE_ARGS", "")
        if env_cmake_args:
            cmake_args += shlex.split(env_cmake_args)

        if os.environ.get("HEXL_NO_CPUFEATURES", "") not in ("", "0", "False", "false", "off", "OFF"):
            cmake_args += ['-DHEXL_USE_CPUFEATURES=OFF']

        build_temp = os.path.join(self.build_temp, ext.name)
        os.makedirs(build_temp, exist_ok=True)

        subprocess.check_call(['cmake', ext.sourcedir] + cmake_args, cwd=build_temp)
        subprocess.check_call(['cmake', '--build', '.', '--config', 'Release'], cwd=build_temp)

setup(
    name='evd_py',
    version=__version__,
    author='Jaejin Lee',
    author_email='jaejin.lee@snu.ac.kr',
    description='Python bindings for EVD library',
    long_description='',
    ext_modules=[CMakeExtension('evd_py', '.')],
    cmdclass={'build_ext': CMakeBuild},
    zip_safe=False,
    python_requires='>=3.7',
    classifiers=[],
)
