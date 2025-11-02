cmake_minimum_required(VERSION 3.14)

project(
  evd
  VERSION 1.0
  LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(BUILD_HEXL "Build HEXL from source" ON)
option(BUILD_PYTHON "Build Python bindings" OFF)

add_library(
  evd src/Client.cpp src/EVDClient.cpp src/EVDServer.cpp src/HEval.cpp
      src/PIRServer.cpp src/Random.cpp src/Server.cpp src/SecretKey.cpp)

target_include_directories(
  evd PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
             $<INSTALL_INTERFACE:include>)

include(FetchContent)

if(BUILD_HEXL)
  FetchContent_Declare(
    hexl
    GIT_REPOSITORY https://github.com/intel/hexl.git
    GIT_TAG v1.2.5)
  set(HEXL_BENCHMARK OFF)
  set(HEXL_TESTING OFF)
  FetchContent_MakeAvailable(hexl)
else()
  find_package(hexl REQUIRED)
endif()

FetchContent_Declare(
  asio
  URL https://github.com/chriskohlhoff/asio/archive/refs/tags/asio-1-30-2.zip)
FetchContent_MakeAvailable(asio)

find_package(OpenSSL REQUIRED)
find_package(OpenMP REQUIRED)

target_include_directories(evd PUBLIC ${hexl_INCLUDE_DIRS})
target_link_libraries(evd PUBLIC hexl crypto OpenMP::OpenMP_CXX OpenSSL::SSL OpenSSL::Crypto)

# Python bindings
if(BUILD_PYTHON)
  find_package(Python3 COMPONENTS Interpreter Development REQUIRED)
  FetchContent_Declare(
    pybind11
    GIT_REPOSITORY https://github.com/pybind/pybind11.git
    GIT_TAG v2.11.1)
  FetchContent_MakeAvailable(pybind11)

  pybind11_add_module(evd_py python/bindings.cpp)
  target_link_libraries(evd_py PRIVATE evd)
  target_include_directories(evd_py PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  
  # Set output directory for Python module
  set_target_properties(evd_py PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_LIBRARY_OUTPUT_DIRECTORY}
    PREFIX "")
endif()

include(GNUInstallDirs)
install(
  TARGETS evd
  EXPORT evdTargets
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  INCLUDES
  DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(
  EXPORT evdTargets
  FILE evdConfig.cmake
  NAMESPACE evd::
  DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/evd)

include(CMakePackageConfigHelpers)
write_basic_package_version_file(
  "${CMAKE_CURRENT_BINARY_DIR}/evdConfigVersion.cmake"
  VERSION ${PROJECT_VERSION}
  COMPATIBILITY AnyNewerVersion)
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/evdConfigVersion.cmake"
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/evd)
