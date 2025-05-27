This extension works for typescript projects

- The aim of this project is the removal of barrel files(https://tkdodo.eu/blog/please-stop-using-barrel-files).
  - The issue with removal of barrel files is you need to re configure all the dependencies in each file which is troublesome
  - This project first reads the log of typescript compilation and then first comment all the erraneaous imports and then for each infected file corrects the import
 
