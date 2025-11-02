#!/usr/bin/env python3

import evd_py
import sys
import signal
import threading
import time

class EVDServerRunner:
    def __init__(self, port):
        self.port = port
        self.server = None
        self.server_thread = None
        self.running = False
        
    def signal_handler(self, signum, frame):
        """Gracefully shut down the server on SIGINT or SIGTERM."""
        print(f"\nReceived signal {signum}. Shutting down server...")
        self.stop()
        
    def run_server(self):
        try:
            self.server = evd_py.EVDServer(self.port)
            print(f"EVD Server started on port {self.port}")
            self.server.run()
        except Exception as e:
            if self.running:
                print(f"Server error: {e}")
    
    def start(self):
        print(f"Starting EVD Server on port {self.port}...")
        print("Press Ctrl+C to stop")
        
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        self.running = True
        
        self.server_thread = threading.Thread(target=self.run_server, daemon=True)
        self.server_thread.start()
        
        try:
            while self.running and self.server_thread.is_alive():
                time.sleep(0.1)
        except KeyboardInterrupt:
            print("\nKeyboard interrupt received. Shutting down...")
            self.stop()
    
    def stop(self):
        if self.running:
            self.running = False
            print("Stopping server...")
            
            if self.server_thread and self.server_thread.is_alive():
                self.server_thread.join(timeout=2.0)
                
            print("Server stopped.")
            sys.exit(0)

def main():
    port = 9000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Error: Port must be a number")
            sys.exit(1)
    
    server_runner = EVDServerRunner(port)
    server_runner.start()

if __name__ == "__main__":
    main() 