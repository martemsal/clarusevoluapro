import sys

def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "User"
    print(f"Hello, {name}! AGENTE7 system is online.")

if __name__ == "__main__":
    main()
