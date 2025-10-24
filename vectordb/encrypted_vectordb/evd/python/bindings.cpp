#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "evd/Ciphertext.hpp"
#include "evd/Client.hpp"
#include "evd/Const.hpp"
#include "evd/EVDClient.hpp"
#include "evd/EVDServer.hpp"
#include "evd/Keys.hpp"
#include "evd/MLWECiphertext.hpp"
#include "evd/Message.hpp"
#include "evd/MetricType.hpp"
#include "evd/Polynomial.hpp"
#include "evd/SecretKey.hpp"
#include "evd/Server.hpp"
#include "evd/SwitchingKey.hpp"
#include "evd/TopK.hpp"
#include "evd/Type.hpp"

namespace py = pybind11;

PYBIND11_MODULE(evd_py, m) {
  m.doc() = "Python bindings for EVD library";

  py::enum_<evd::MetricType>(m, "MetricType")
      .value("IP", evd::MetricType::IP)
      .value("L2", evd::MetricType::L2)
      .value("COSINE", evd::MetricType::COSINE)
      .export_values();

  py::class_<evd::Message>(m, "Message", py::buffer_protocol())
      .def(py::init<evd::u64>())
      .def("get_degree", &evd::Message::getDegree)
      .def_buffer([](evd::Message &self) -> py::buffer_info {
        return py::buffer_info(static_cast<void *>(self.getData()),
                               sizeof(double),
                               py::format_descriptor<double>::format(), 1,
                               {self.getDegree()}, {sizeof(double)});
      })
      .def("__getitem__",
           [](const evd::Message &self, std::size_t idx) { return self[idx]; })
      .def("__setitem__", [](evd::Message &self, std::size_t idx,
                             double value) { self[idx] = value; });

  py::class_<evd::Client>(m, "Client")
      .def(py::init<evd::u64>())
      .def("gen_sec_key", &evd::Client::genSecKey)
      .def("gen_relin_key", &evd::Client::genRelinKey)
      .def("gen_auted_mod_pack_keys", &evd::Client::genAutedModPackKeys)
      .def("gen_inv_auted_mod_pack_keys", &evd::Client::genInvAutedModPackKeys)
      .def("encrypt_query", &evd::Client::encryptQuery)
      .def("encrypt_key", &evd::Client::encryptKey)
      .def("encode", &evd::Client::encode)
      .def("decode", &evd::Client::decode)
      .def("encrypt",
           py::overload_cast<evd::Ciphertext &, const evd::Polynomial &,
                             const evd::SecretKey &>(&evd::Client::encrypt))
      .def("encrypt", py::overload_cast<evd::Ciphertext &, const evd::Message &,
                                        const evd::SecretKey &, double>(
                          &evd::Client::encrypt))
      .def("decrypt", &evd::Client::decrypt)
      .def("decrypt_score", &evd::Client::decryptScore)
      .def("top_k_score",
           py::overload_cast<evd::TopK &, const std::vector<evd::Message> &>(
               &evd::Client::topKScore))
      .def("get_rank", &evd::Client::getRank)
      .def("get_inv_rank", &evd::Client::getInvRank);

  py::class_<evd::MLWECiphertext>(m, "MLWECiphertext")
      .def(py::init<evd::u64>())
      .def(
          "get_a",
          [](evd::MLWECiphertext &self, evd::u64 idx) -> evd::Polynomial & {
            return self.getA(idx);
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_b",
          [](evd::MLWECiphertext &self) -> evd::Polynomial & {
            return self.getB();
          },
          py::return_value_policy::reference_internal);

  // SwitchingKey bindings
  py::class_<evd::SwitchingKey>(m, "SwitchingKey")
      .def(py::init<>())
      .def(
          "get_poly_a_mod_q",
          [](evd::SwitchingKey &self) -> evd::Polynomial & {
            return self.getPolyAModQ();
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_a_mod_p",
          [](evd::SwitchingKey &self) -> evd::Polynomial & {
            return self.getPolyAModP();
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_b_mod_q",
          [](evd::SwitchingKey &self) -> evd::Polynomial & {
            return self.getPolyBModQ();
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_b_mod_p",
          [](evd::SwitchingKey &self) -> evd::Polynomial & {
            return self.getPolyBModP();
          },
          py::return_value_policy::reference_internal);

  // MLWESwitchingKey bindings
  py::class_<evd::MLWESwitchingKey>(m, "MLWESwitchingKey")
      .def(py::init<evd::u64>())
      .def(
          "get_poly_a_mod_q",
          [](evd::MLWESwitchingKey &self, evd::u64 idx) -> evd::Polynomial & {
            return self.getPolyAModQ(idx);
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_a_mod_p",
          [](evd::MLWESwitchingKey &self, evd::u64 idx) -> evd::Polynomial & {
            return self.getPolyAModP(idx);
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_b_mod_q",
          [](evd::MLWESwitchingKey &self, evd::u64 idx) -> evd::Polynomial & {
            return self.getPolyBModQ(idx);
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_b_mod_p",
          [](evd::MLWESwitchingKey &self, evd::u64 idx) -> evd::Polynomial & {
            return self.getPolyBModP(idx);
          },
          py::return_value_policy::reference_internal);

  // AutedModPackKeys bindings
  py::class_<evd::AutedModPackKeys>(m, "AutedModPackKeys")
      .def(py::init<evd::u64>())
      .def(
          "get_key",
          [](evd::AutedModPackKeys &self, evd::u64 i, evd::u64 j)
              -> evd::SwitchingKey & { return self.getKeys()[i][j]; },
          py::return_value_policy::reference_internal);

  // AutedModPackMLWEKeys bindings
  py::class_<evd::AutedModPackMLWEKeys>(m, "AutedModPackMLWEKeys")
      .def(py::init<evd::u64>())
      .def(
          "get_key",
          [](evd::AutedModPackMLWEKeys &self, evd::u64 i, evd::u64 j)
              -> evd::MLWESwitchingKey & { return self.getKeys()[i][j]; },
          py::return_value_policy::reference_internal);

  // CachedQuery bindings
  py::class_<evd::CachedQuery>(m, "CachedQuery").def(py::init<evd::u64>());

  // CachedKeys bindings
  py::class_<evd::CachedKeys>(m, "CachedKeys").def(py::init<evd::u64>());

  // Server bindings
  py::class_<evd::Server>(m, "Server")
      .def(py::init<evd::u64, const evd::SwitchingKey &,
                    const evd::AutedModPackKeys &,
                    const evd::AutedModPackMLWEKeys &>())
      .def("cache_query",
           [](evd::Server &self, evd::CachedQuery &cache,
              const evd::MLWECiphertext &query) {
             self.cacheQuery(cache, query);
           })
      .def("cache_keys",
           [](evd::Server &self, evd::CachedKeys &cache,
              const std::vector<evd::MLWECiphertext> &keys) {
             self.cacheKeys(cache, keys);
           })
      .def("inner_product", [](evd::Server &self, evd::Ciphertext &res,
                               const evd::CachedQuery &query_cache,
                               const evd::CachedKeys &key_cache) {
        self.innerProduct(res, query_cache, key_cache);
      });

  // Polynomial bindings
  py::class_<evd::Polynomial>(m, "Polynomial", py::buffer_protocol())
      .def(py::init<evd::u64, evd::u64>())
      .def("get_degree", &evd::Polynomial::getDegree)
      .def("get_mod", &evd::Polynomial::getMod)
      .def("get_is_ntt", &evd::Polynomial::getIsNTT)
      .def("set_is_ntt", &evd::Polynomial::setIsNTT)
      .def_buffer([](evd::Polynomial &self) -> py::buffer_info {
        return py::buffer_info(
            static_cast<void *>(self.getData()),       // Pointer to buffer
            sizeof(evd::u64),                          // Size of one scalar
            py::format_descriptor<evd::u64>::format(), // Python struct-style
                                                       // format descriptor
            1,                                         // Number of dimensions
            {self.getDegree()},                        // Buffer dimensions
            {sizeof(evd::u64)} // Strides (in bytes) for each index
        );
      })
      .def("__getitem__", [](const evd::Polynomial &self,
                             std::size_t idx) { return self[idx]; })
      .def("__setitem__", [](evd::Polynomial &self, std::size_t idx,
                             evd::u64 value) { self[idx] = value; });

  // SecretKey bindings
  py::class_<evd::SecretKey>(m, "SecretKey")
      .def(py::init<>())
      .def(
          "get_poly_q",
          [](evd::SecretKey &self) -> evd::Polynomial & {
            return self.getPolyQ();
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_poly_p",
          [](evd::SecretKey &self) -> evd::Polynomial & {
            return self.getPolyP();
          },
          py::return_value_policy::reference_internal);

  // Ciphertext bindings
  py::class_<evd::Ciphertext>(m, "Ciphertext")
      .def(py::init<bool>(), py::arg("is_extended") = false)
      .def("set_is_ntt", &evd::Ciphertext::setIsNTT)
      .def("get_degree", &evd::Ciphertext::getDegree)
      .def("get_is_extended", &evd::Ciphertext::getIsExtended)
      .def("get_is_ntt", &evd::Ciphertext::getIsNTT)
      .def(
          "get_a",
          [](evd::Ciphertext &self) -> evd::Polynomial & {
            return self.getA();
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_b",
          [](evd::Ciphertext &self) -> evd::Polynomial & {
            return self.getB();
          },
          py::return_value_policy::reference_internal)
      .def(
          "get_c",
          [](evd::Ciphertext &self) -> evd::Polynomial & {
            return self.getC();
          },
          py::return_value_policy::reference_internal);

  // TopK bindings
  py::class_<evd::TopK>(m, "TopK")
      .def(py::init<size_t>())
      .def("__getitem__",
           [](const evd::TopK &self, size_t i) { return self[i]; })
      .def("__setitem__", [](evd::TopK &self, size_t i, int v) { self[i] = v; })
      .def("__len__", &evd::TopK::size);

  // EVDClient bindings
  py::class_<evd::EVDClient>(m, "EVDClient")
      .def(py::init<const std::string &, const std::string &>(),
           py::arg("host"), py::arg("port"))
      .def("setup_collection", &evd::EVDClient::setupCollection,
           py::arg("collection_name"), py::arg("dimension"),
           py::arg("metric_type"), py::arg("is_query_encrypt") = true)
      .def("drop_collection", &evd::EVDClient::dropCollection,
           py::arg("collection_name"))
      .def("terminate", &evd::EVDClient::terminate)
      .def(
          "insert",
          [](evd::EVDClient &self, const std::string &collectionName,
             py::array_t<float, py::array::c_style | py::array::forcecast> db,
             const std::vector<std::string> &payloads) {
            if (db.ndim() != 2) {
              throw std::runtime_error("Input database must be a 2D array.");
            }
            if (static_cast<size_t>(db.shape(0)) != payloads.size()) {
              throw std::runtime_error(
                  "Input database and payloads must have the same number of "
                  "entries.");
            }
            std::vector<std::vector<float>> cpp_db(db.shape(0));
            for (ssize_t i = 0; i < db.shape(0); ++i) {
              cpp_db[i].resize(db.shape(1));
              for (ssize_t j = 0; j < db.shape(1); ++j) {
                cpp_db[i][j] = *db.data(i, j);
              }
            }
            self.insert(collectionName, cpp_db, payloads);
          },
          py::arg("collection_name"), py::arg("db"), py::arg("payloads"))
      .def(
          "query",
          [](evd::EVDClient &self, const std::string &collectionName,
             py::array_t<float, py::array::c_style | py::array::forcecast>
                 query_vec) {
            if (query_vec.ndim() != 1) {
              throw std::runtime_error("Input query must be a 1D array.");
            }
            std::vector<float> cpp_query_vec(query_vec.size());
            for (ssize_t i = 0; i < query_vec.size(); ++i) {
              cpp_query_vec[i] = *query_vec.data(i);
            }
            std::vector<float> result_vec =
                self.query(collectionName, cpp_query_vec);
            return py::cast(result_vec);
          },
          py::arg("collection_name"), py::arg("query_vec"))
      .def(
          "query_and_top_k",
          [](evd::EVDClient &self, evd::TopK &res,
             const std::string &collectionName,
             py::array_t<float, py::array::c_style | py::array::forcecast>
                 query_vec) {
            if (query_vec.ndim() != 1) {
              throw std::runtime_error("Input query must be a 1D array.");
            }
            std::vector<float> cpp_query_vec(query_vec.size());
            for (ssize_t i = 0; i < query_vec.size(); ++i) {
              cpp_query_vec[i] = *query_vec.data(i);
            }
            self.queryAndTopK(res, collectionName, cpp_query_vec);
          },
          py::arg("res"), py::arg("collection_name"), py::arg("query_vec"))
      .def(
          "query_and_top_k_with_scores",
          [](evd::EVDClient &self, const std::string &collectionName,
             py::array_t<float, py::array::c_style | py::array::forcecast>
                 query_vec,
             evd::u64 k) {
            if (query_vec.ndim() != 1) {
              throw std::runtime_error("Input query must be a 1D array.");
            }
            std::vector<float> cpp_query_vec(query_vec.size());
            for (ssize_t i = 0; i < query_vec.size(); ++i) {
              cpp_query_vec[i] = *query_vec.data(i);
            }
            std::vector<std::pair<evd::u64, float>> results;
            self.queryAndTopKWithScores(results, collectionName, cpp_query_vec,
                                        k);

            // Convert to Python-friendly format
            py::list py_results;
            for (const auto &pair : results) {
              py_results.append(py::make_tuple(pair.first, pair.second));
            }
            return py_results;
          },
          py::arg("collection_name"), py::arg("query_vec"), py::arg("k"))
      .def_static(
          "get_top_k_indices",
          [](py::array_t<float, py::array::c_style | py::array::forcecast>
                 scores,
             evd::u64 k) {
            if (scores.ndim() != 1) {
              throw std::runtime_error("Input scores must be a 1D array.");
            }
            std::vector<float> cpp_scores(scores.size());
            for (ssize_t i = 0; i < scores.size(); ++i) {
              cpp_scores[i] = *scores.data(i);
            }
            std::vector<evd::u64> results =
                evd::EVDClient::getTopKIndices(cpp_scores, k);
            return py::cast(results);
          },
          py::arg("scores"), py::arg("k"))
      .def("retrieve", &evd::EVDClient::retrieve, py::arg("collection_name"),
           py::arg("index"))
      .def("retrieve_pir", &evd::EVDClient::retrievePIR,
           py::arg("collection_name"), py::arg("index"));

  // EVDServer bindings
  py::class_<evd::EVDServer>(m, "EVDServer")
      .def(py::init<unsigned short>(), py::arg("port"))
      .def("run", &evd::EVDServer::run,
           py::call_guard<py::gil_scoped_release>());
}