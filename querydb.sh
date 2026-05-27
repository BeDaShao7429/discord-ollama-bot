QUERY="db.docchunks.deleteMany({})"

sudo docker exec -it mongodb-ollama mongosh discord-bot \
  -u "admin" \
  -p "password123" \
  --authenticationDatabase "admin" \
  --eval "${QUERY}"
